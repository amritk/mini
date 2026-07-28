import type { RouteParams } from '@amritk/mini-helpers'
import { effect, effectScope } from 'alien-signals'

import { applyProp } from '../apply-prop'
import { currentFrame, withFrame } from '../context-frame'
import { scheduleFlush } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { onCleanup } from '../on-cleanup'
import { reducedMotion } from '../reduced-motion'
import { runDetached } from '../run-detached'
import { type Signal, signal } from '../signals'
import { applyStyle, applyVisible } from '../style/apply-style'
import { createElement, insert, remove } from '../tree'
import type { ClassValue, Dispose, MaybeReactive, StyleValue } from '../types'
import { untrack } from '../untrack'
import type { Route, Router, RouteState } from './create-router'
import type { StackChange, StackTransition } from './stack-transition'

/** Props for {@link RouteStack}. */
export type RouteStackProps<R extends Route> = {
  router: Router<R>
  /** Rendered for a screen whose location matched nothing. Nothing renders when it is omitted. */
  fallback?: () => LynxElement
  /**
   * How a change is animated. Omitted means instantly, which is also what an app
   * respecting a reduced-motion preference passes.
   * {@link fadeTransition} is the one shipped.
   */
  transition?: StackTransition
  /** Class for the stack container. */
  class?: MaybeReactive<ClassValue>
  /** Style for the stack container, laid over its own positioning. */
  style?: MaybeReactive<StyleValue | null>
  /** Called with the container once built. */
  ref?: (element: LynxElement) => void
}

/** One live screen: the card it was built into, and what it was built FROM. */
type StackEntry<R extends Route> = {
  /** The history depth this screen sits at, which is what makes it poppable. */
  depth: number
  /** The element the stack owns and positions. The screen is its only child. */
  card: LynxElement
  /** The route this screen was built for, or `null` for the fallback. */
  route: R | null
  /**
   * The params handed to the screen, as a signal.
   *
   * Per SCREEN rather than read off the router, which is the difference between
   * a stack and a single slot. `RouteView` can hand every screen the router's
   * current params because it only ever has one; here the screens underneath
   * must keep reporting the params they were pushed with, or a stack of
   * `/users/1` and `/users/2` would show user 2 twice.
   */
  params: Signal<RouteParams>
  dispose: Dispose
}

/**
 * A navigation stack: screens pushed over one another, popped back off, and
 * animated between.
 *
 * The stack is the router's DEPTH made visible. `RouteView` renders one slot and
 * reads the matched route, which is all a single screen needs; a stack needs to
 * know whether a location arrived by being pushed on top of the last one or by
 * replacing it, and only {@link Router.depth} answers that — `/users/1` →
 * `/users/2` is two screens when pushed and one when replaced, and the matched
 * route is identical either way.
 *
 * ```tsx
 * <RouteStack router={router} transition={fadeTransition()} fallback={() => <NotFound />} />
 * ```
 *
 * ## What it keeps alive
 *
 * Every screen beneath the top one stays built, and that is the point rather
 * than a cost to optimise away: a scroll position, a half-filled form, and an
 * in-flight request all survive a push and are still there on the way back —
 * which is exactly what a user expects from a back gesture and exactly what
 * rebuilding on pop would throw away. They are hidden through {@link applyVisible},
 * so a buried screen carries `display: none` and is genuinely out of the layout
 * and out of the accessibility tree, not merely painted over by the card above.
 *
 * It follows that a stack fifty screens deep holds fifty screens. That is the
 * same trade every native stack navigator makes, and it is bounded by the app's
 * own navigation rather than by anything here.
 *
 * ## The one layout opinion in the package
 *
 * Cards are absolutely positioned inside the container, because two screens have
 * to overlap for any transition between them to mean anything — in normal flow
 * they would stack head to tail and a cross-fade would fade between two things
 * that are not in the same place. This is structural rather than taste, and it
 * is the same shape every stack navigator on every platform arrives at.
 *
 * The container is a real `view` for the same reason, and this is the one place
 * in the package where a `wrapper` would be wrong: a wrapper takes no part in
 * layout, which is precisely what makes it unable to be the positioning context
 * its cards resolve against.
 *
 * The card is what a transition moves, never the screen inside it. A screen
 * binds its own `style`, and Lynx keeps an element's whole inline style in one
 * channel — so a write from out here would not merely fight that binding, it
 * would replace it. The card belongs to the stack, which is why
 * {@link StackTransitionContext.style} merges over the stack's own positioning
 * rather than handing a transition the style channel outright.
 *
 * ## Where the back gesture comes from
 *
 * A hardware back gesture, a deep link and an in-app back button all arrive the
 * same way — the history notifies, the depth moves, the stack pops — because the
 * history is the seam and it was already abstracted. `createMemoryHistory` is
 * the one this package ships and it is the real thing rather than a stand-in: a
 * Lynx app owns its stack of screens outright.
 *
 * The transition defaults to none. Motion is the app's decision, and it is the
 * app that can read whether the user asked for less of it.
 */
export const RouteStack = <R extends Route>(props: RouteStackProps<R>): LynxElement => {
  const container = createElement('view')
  applyProp(container, 'style', mergeStyle(CONTAINER, props.style))
  if (props.class !== undefined) applyProp(container, 'class', props.class)
  props.ref?.(container)

  // Captured while the component is still running, and restored around every
  // screen built afterwards — all of which happen later, inside the effect
  // below. Without it a theme provided at the app root would reach the first
  // screen and none of the ones pushed over it. See `context-frame.ts`.
  const frame = currentFrame()

  const entries: StackEntry<R>[] = []
  // Screens on their way out: popped or replaced, still in the tree because a
  // transition is running over them. Disposed the moment it ends, or the moment
  // another navigation makes it moot.
  let leaving: StackEntry<R>[] = []
  // Bumped on every change, so a transition that resolves after the stack has
  // moved on cannot settle a state that is no longer the current one.
  let generation = 0

  const build = (state: RouteState<R>, depth: number, anchor: LynxElement | null = null): StackEntry<R> => {
    const card = createElement('view')
    applyStyle(card, CARD)
    const params = signal(state.params)
    const matched = state.route

    let node: LynxElement | null = null
    // Detached and scoped for the same reason `list` builds its rows that way:
    // this runs inside a tracking effect, and a scope created there is torn
    // down when that effect re-runs — so pushing a second screen would silently
    // stop every binding in the first while leaving it on screen looking
    // correct. Owning the lifetime here is what makes a buried screen keep
    // working. See `run-detached.ts`.
    const dispose = runDetached(() =>
      effectScope(() => {
        node = withFrame(frame, () => (matched === null ? (props.fallback?.() ?? null) : matched.view(params)))
      }),
    )
    if (node !== null) insert(card, node, null)
    // Tree order IS paint order for overlapping siblings, so appending is what
    // makes the arriving screen the one on top during a push — no `z-index` to
    // keep in step with anything. A pop wants the opposite and passes an anchor,
    // so the screen being revealed sits UNDER the one fading off it.
    insert(container, card, anchor)
    return { depth, card, route: matched, params, dispose }
  }

  /** Disposes an entry and takes its card out of the tree. */
  const destroy = (entry: StackEntry<R>): void => {
    entry.dispose()
    remove(entry.card)
  }

  /** Ends whatever is on its way out, immediately and without waiting for anything. */
  const flushLeaving = (): void => {
    for (const entry of leaving) destroy(entry)
    leaving = []
  }

  /**
   * The state every change settles into: only the top screen visible, nothing
   * half-removed.
   *
   * Reached whether the transition finished, was skipped, or was cut short by
   * the next navigation — which is what lets a test assert the same tree against
   * the fake engine that a device ends up showing.
   */
  const settle = (): void => {
    flushLeaving()
    const top = entries[entries.length - 1]
    for (const entry of entries) applyVisible(entry.card, entry === top)
    scheduleFlush()
  }

  /** Hands the two cards to the transition, and settles when it says so. */
  const transition = (change: StackChange, entering: LynxElement | null, exiting: LynxElement | null): void => {
    const running = generation
    // Reduced motion is honoured HERE rather than inside each transition, so it
    // costs an app nothing and covers a transition this package never saw. It is
    // read untracked on purpose: this runs during a navigation, and taking a
    // dependency on the preference would tie the enclosing scope to a signal that
    // has nothing to do with which screen is on top.
    const skip = untrack(reducedMotion)
    const result = skip ? undefined : props.transition?.({ change, entering, exiting, style: styleCard })
    if (result === undefined || result === null) {
      settle()
      return
    }
    scheduleFlush()
    const done = (): void => {
      // Another navigation has already flushed and settled past this one.
      if (running === generation) settle()
    }
    // Settled on a rejection too, and deliberately: a transition that threw is
    // an app's bug, and refusing to settle would turn it into this component's
    // — a stack stuck with two screens showing and a popped one never disposed.
    // The tree ends up where it would have if the animation had been skipped.
    void Promise.resolve(result).then(done, done)
  }

  /**
   * Replaces the top entry with a screen built for `state`, holding the old one
   * so a transition still has something to move. Returns the card that arrived.
   */
  const swapTop = (state: RouteState<R>, anchor: LynxElement | null): LynxElement => {
    const previous = entries.pop() as StackEntry<R>
    // Held rather than destroyed, so the outgoing screen is still on screen for
    // a transition to move. `flushLeaving` ends it either way.
    leaving.push(previous)
    const next = build(state, previous.depth, anchor)
    entries.push(next)
    return next.card
  }

  const sync = (state: RouteState<R>, depth: number): void => {
    generation += 1
    // Anything from the previous change is over the moment a new one lands:
    // ending it now keeps the tree honest and means no transition can dispose a
    // screen the stack has since decided to keep.
    flushLeaving()

    if (entries.length === 0) {
      // The first screen is not a navigation, so nothing animates it in.
      entries.push(build(state, depth))
      settle()
      return
    }

    const top = entries[entries.length - 1] as StackEntry<R>

    if (depth > top.depth) {
      const pushed = build(state, depth)
      entries.push(pushed)
      transition('push', pushed.card, top.card)
      return
    }

    if (depth < top.depth) {
      // The screens above the depth the app has gone back to. The last of them
      // is the one the user sees leaving; the rest were skipped over by a
      // multi-step back and never had a transition of their own.
      while (entries.length > 1 && (entries[entries.length - 1] as StackEntry<R>).depth > depth) {
        leaving.push(entries.pop() as StackEntry<R>)
      }
      const revealed = entries[entries.length - 1] as StackEntry<R>
      // Below the floor: an app deep-linked into the middle of a stack starts
      // with one screen and a depth to match, so going back from there has
      // nothing to pop and rebases instead. Keeping an entry is what guarantees
      // the stack is never empty.
      if (revealed.depth > depth) revealed.depth = depth
      applyVisible(revealed.card, true)
      // The lowest card on its way out, which every rebuilt screen must go
      // beneath: what is being revealed belongs under what is leaving.
      const under = leaving[0]?.card ?? null
      const exiting = leaving[leaving.length - 1]?.card ?? null

      if (revealed.route !== state.route) {
        // The revealed screen is not what the location says it should be — a
        // replace landed underneath it, or the rebase above just moved it.
        // Rebuild it rather than show a screen the router disagrees with.
        transition('pop', swapTop(state, under), exiting)
        return
      }

      revealed.params(state.params)
      transition('pop', revealed.card, exiting)
      return
    }

    // The same route means the same screen: `/users/1` → `/users/2` keeps
    // whatever is inside it and reports new params, exactly as `RouteView`
    // does. A screen is rebuilt only when it is genuinely a different one.
    if (top.route === state.route) {
      top.params(state.params)
      settle()
      return
    }
    transition('replace', swapTop(state, null), top.card)
  }

  const stop = effect(() => {
    const state = props.router.route()
    const depth = props.router.depth()
    // Read both above, then leave the tracking scope: building a screen reads
    // whatever that screen reads, and this effect must not subscribe to any of
    // it. `runDetached` already stops the dependency collection, so this is the
    // belt to its braces — and it also keeps the `params` writes below from
    // being read back as dependencies.
    untrack(() => sync(state, depth))
  })

  onCleanup(() => {
    stop()
    // Past every transition still in flight, so one resolving after this cannot
    // settle a stack that no longer exists.
    generation += 1
    flushLeaving()
    for (const entry of entries) destroy(entry)
    entries.length = 0
  })

  return container
}

/**
 * Lays a transition's declarations over a card's own positioning, and restores
 * that positioning when passed `null`.
 *
 * This is the whole reason {@link StackTransitionContext} carries a writer
 * rather than letting a transition reach for `applyStyle` itself. Lynx keeps an
 * element's inline style in ONE channel and `__SetInlineStyles` replaces it
 * wholesale, so a transition writing `{ opacity: 0 }` at a card would take
 * {@link CARD} with it — and cards that no longer overlap are cards a cross-fade
 * cannot cross-fade. Merging here keeps the positioning the stack's, and keeps
 * "leave no style behind" a single call rather than a thing every transition
 * author has to reconstruct.
 */
const styleCard = (card: LynxElement, declarations: StyleValue | null): void => {
  applyStyle(card, declarations === null ? CARD : { ...CARD, ...declarations })
}

/**
 * Lays a caller's `style` over the stack's own base declarations, preserving the
 * reactive form.
 *
 * A getter comes back as a getter, so a style that tracks a signal goes on
 * tracking it. Collapsing it to a value here would turn a live binding into a
 * one-time write, which is this package's single most expensive mistake to
 * debug — and the one `bun run check:reactivity` exists to catch in JSX.
 *
 * This used to be `/ui`'s `mergeStyle`, shared by half a dozen components. That
 * layer is gone with the vocabulary it existed to confine, and the stack is the
 * only thing left that carries base layout of its own, so the merge lives here
 * as the small local helper it always was.
 */
const mergeStyle = (
  base: StyleValue,
  style: MaybeReactive<StyleValue | null> | undefined,
): MaybeReactive<StyleValue> => {
  if (style === undefined) return base
  if (typeof style === 'function') return () => ({ ...base, ...style() })
  return { ...base, ...style }
}

/**
 * The stack fills what it is given and is the positioning context its cards
 * resolve against.
 *
 * `position: relative` is the load-bearing one and it is stated explicitly even
 * though Lynx already defaults to it, because the whole layout opinion below
 * rests on it: an absolutely positioned card resolves against its nearest
 * positioned ancestor, and if that stopped being the container the cards would
 * escape to wherever the app happened to position something further up.
 */
const CONTAINER: StyleValue = { display: 'flex', flexDirection: 'column', flex: 1, position: 'relative' }

/**
 * A card fills the stack and stacks its own content.
 *
 * Spelled as four edges rather than as `inset`, which is a shorthand Lynx's CSS
 * does not read — and a declaration Lynx does not read is dropped in silence,
 * which here would mean every card collapsing to nothing.
 */
const CARD: StyleValue = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  display: 'flex',
  flexDirection: 'column',
}
