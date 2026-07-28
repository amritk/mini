import type { LynxElement } from '../engine/element-api'
import type { StyleValue } from '../types'

/** Why the stack changed, so a transition can move in the direction that happened. */
export type StackChange = 'push' | 'pop' | 'replace'

/**
 * How long a transition runs, spelled the way CSS spells it.
 *
 * This is deliberately smaller than the timeline options the package used to
 * carry. Lynx interpolates a transition itself once the declaration is on the
 * element, so `duration`, `delay` and `easing` are the whole of what there is to
 * say — iteration counts and directions belong to `@keyframes`, which an app
 * authors in its own stylesheet rather than through this seam.
 */
export type TransitionTiming = {
  /** How long the change takes, in milliseconds. */
  readonly duration: number
  /** How long to wait before it starts. Defaults to none. */
  readonly delay?: number
  /**
   * The easing curve, as a CSS timing function — a keyword or a
   * `cubic-bezier(…)`. Left as a string rather than a union because the engine
   * parses it, and enumerating the curves here would only mean rejecting one
   * Lynx understands.
   */
  readonly easing?: string
}

/** The two screens a transition has to move, and which way the stack went. */
export type StackTransitionContext = {
  /** What the change was — a screen pushed on, popped off, or swapped in place. */
  change: StackChange
  /**
   * The card arriving, or `null` when nothing is. Always the card, never the
   * screen inside it: the card is the element the stack owns, so animating it
   * cannot collide with a `style` the screen binds for itself.
   */
  entering: LynxElement | null
  /** The card leaving, or `null` when nothing is. */
  exiting: LynxElement | null
  /**
   * Lays declarations over a card's own positioning, and takes them away again
   * when passed `null`.
   *
   * A transition writes style through THIS rather than through `applyStyle`, and
   * that is a Lynx constraint rather than a nicety. The engine keeps an
   * element's whole inline style in one channel and `__SetInlineStyles` replaces
   * that channel wholesale, so writing `{ opacity: 0 }` straight at a card would
   * take its `position: absolute` with it — and two cards that no longer overlap
   * make a cross-fade fade between two things that are not in the same place.
   * The stack owns the card's positioning, so the stack is what merges over it.
   *
   * `style(card, null)` is how a transition releases the card back to that
   * positioning, which is the "leave no style behind" half of the contract
   * below.
   */
  style: (card: LynxElement, declarations: StyleValue | null) => void
}

/**
 * How a stack change is animated.
 *
 * Returning a promise is what holds the outgoing screen on screen: the stack
 * waits for it before hiding the card underneath and disposing anything popped.
 * Returning nothing settles immediately, which is also the path
 * {@link fadeTransition} takes when the engine's context has no timer to wait
 * on.
 *
 * A transition must not leave a style behind. The settled tree has to be
 * identical whether the animation ran, was skipped, or was interrupted by
 * another navigation — so every declaration a transition writes through
 * {@link StackTransitionContext.style} has to end with a `style(card, null)`,
 * and it has to happen before the returned promise settles.
 *
 * **Reduced motion is handled for you, above this seam.** `RouteStack` consults
 * `reducedMotion()` and skips the transition entirely when it is set, so a
 * transition never has to check — including one this package never saw. The app's
 * only job is to state the preference once with `setReducedMotion`, because the
 * engine has no field to read it from: there is no reduced-motion entry on
 * `SystemInfo` and Lynx has no media queries, so it reaches the app natively and
 * is passed in the same way colour scheme is.
 *
 * A skipped transition takes the same instant path a stack with no transition at
 * all takes, which is why "leave no style behind" matters — the settled tree has
 * to be identical either way.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: `undefined` would reject the ordinary implementation — an arrow that animates and returns nothing infers `void`, which is not assignable to it.
export type StackTransition = (context: StackTransitionContext) => void | Promise<unknown>

/**
 * A cross-fade between screens, driven by an inline CSS transition.
 *
 * ## Why a CSS transition rather than a timeline
 *
 * This package used to ship an `animate()` that owned keyframes and a timeline
 * and asked each host to run them. Lynx already has all of that — CSS
 * transitions, `@keyframes`, and an `element.animate()` on the main-thread
 * element handle — and reimplementing a timeline over an engine that
 * interpolates for you is exactly the duplication the Lynx rewrite exists to
 * remove.
 *
 * An inline transition is the one of the three that needs nothing from the app.
 * `@keyframes` would mean this component only animating for apps that shipped a
 * stylesheet naming rules this file picked, and `element.animate()` is not on
 * the PAPI surface the runtime is written against. Setting `transition` and the
 * target opacity through the stack's own style channel is self-contained, and
 * the engine interpolates it off the JavaScript thread — which matters more here
 * than anywhere else in the package, because this runtime IS the main thread.
 *
 * ## The two writes, and why they cannot be one
 *
 * The origin is written on its own and committed before the destination
 * follows. A transition interpolates between two committed states, so a card
 * that is created and told to be transparent-then-opaque within a single commit
 * has no earlier state to come from and simply appears. Waiting a turn of the
 * event loop between the two writes is what gives the engine something to
 * interpolate FROM — the runtime's own flush is scheduled on the microtask
 * queue, so a zero-delay timer lands after it.
 *
 * Which is also why this needs a timer, and why it skips rather than degrades
 * when there is not one. Lynx's main-thread context is not the background
 * context and its globals are an engine-version question; a stack whose screens
 * never settled because a timer never fired would be a far worse failure than
 * one that navigates instantly.
 *
 * Opacity is the only property this ships, on purpose. A slide is what a native
 * stack usually wants, and its distance is the viewport's width and its
 * direction depends on the writing mode — both an app's to know. The seam is
 * enough to write one:
 *
 * ```tsx
 * const slide: StackTransition = async ({ change, entering, style }) => {
 *   if (entering === null) return
 *   const width = SystemInfo.pixelWidth / SystemInfo.pixelRatio
 *   const from = change === 'pop' ? -width : width
 *   // The same two writes, for the same reason: the origin has to be committed
 *   // on its own before the engine has anything to interpolate away from.
 *   style(entering, { left: from })
 *   await new Promise((resolve) => setTimeout(resolve, 0))
 *   style(entering, { transition: 'left 220ms ease-out 0ms', left: 0 })
 *   await new Promise((resolve) => setTimeout(resolve, 220))
 *   style(entering, null)
 * }
 * ```
 *
 * ```tsx
 * <RouteStack router={router} transition={fadeTransition()} />
 * ```
 */
export const fadeTransition = (timing: TransitionTiming = { duration: 180, easing: 'ease-out' }): StackTransition => {
  return ({ entering, exiting, style }) => {
    const schedule = timerOf()
    // Skipped, not degraded — and skipping means writing nothing at all, so the
    // tree a stack without a timer settles into is the tree it would have
    // reached anyway. See the note above.
    if (schedule === undefined) return

    return Promise.all([
      crossFade(schedule, style, entering, 0, 1, timing),
      // The one leaving fades out over the same span rather than after it. A
      // sequence would mean a gap with neither screen at full opacity, which
      // reads as a flash of whatever is behind the stack.
      crossFade(schedule, style, exiting, 1, 0, timing),
    ])
  }
}

/**
 * The newest fade running on each card.
 *
 * Navigating twice inside one transition's duration lands two fades on the same
 * card — the screen that was arriving is now the one leaving — and the older of
 * them would otherwise release the card halfway through the newer one, which
 * reads as a flash. Only the newest run writes, so the last navigation is the
 * one that decides how the card looks and the one that hands it back.
 */
const runs = new WeakMap<LynxElement, object>()

/** Fades one card between two opacities, releasing it when it is done. */
const crossFade = async (
  schedule: TimerLike,
  style: StackTransitionContext['style'],
  card: LynxElement | null,
  from: number,
  to: number,
  timing: TransitionTiming,
): Promise<void> => {
  if (card === null) return

  const run = {}
  runs.set(card, run)
  const delay = timing.delay ?? 0

  // The origin, with no `transition` on it, so it takes effect at once.
  style(card, { opacity: from })
  await wait(schedule, 0)
  if (runs.get(card) !== run) return

  // The shorthand always carries a timing function, and the fallback is CSS's
  // own default rather than `linear`: an omitted easing should mean whatever it
  // means everywhere else, not something this file invented.
  style(card, {
    transition: `opacity ${timing.duration}ms ${timing.easing ?? 'ease'} ${delay}ms`,
    opacity: to,
  })
  await wait(schedule, delay + timing.duration)
  if (runs.get(card) !== run) return

  // Released BEFORE the promise settles, so the stack never settles a tree with
  // a transition's declarations still on it.
  style(card, null)
}

/**
 * The slice of the host's timer API this file needs.
 *
 * Declared rather than imported for the same reason `warn.ts` declares its slice
 * of `console`: the package compiles with no platform library at all, because
 * Lynx's main-thread context is not a browser and should not be assumed to have
 * one's globals.
 */
type TimerLike = (callback: () => void, delay: number) => unknown

/** The timer, or `undefined` where the context does not provide one. */
const timerOf = (): TimerLike | undefined => (globalThis as { setTimeout?: TimerLike }).setTimeout

const wait = (schedule: TimerLike, delay: number): Promise<void> =>
  new Promise<void>((resolve) => {
    schedule(() => resolve(), delay)
  })
