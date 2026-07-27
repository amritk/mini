import type { AnimationEnd, AnimationTiming, Host, HostAnimation, Keyframes } from '../host'
import type { HostElement, StyleValue } from '../types'
import type { LynxElement, LynxElementApi } from './lynx-element-api'
import { toCssName } from './to-css-name'
import { toStyleText } from './to-style-text'

/**
 * The clock, read off the global object at CALL time.
 *
 * Declared rather than imported for the same reason `warn.ts` declares its
 * console: timers are a host global rather than part of ECMAScript, and this
 * package compiles with no platform library at all. Read late rather than
 * captured at module load so a test's fake timers — installed after this module
 * is imported — are the ones that actually run the animation.
 */
type Timers = {
  setTimeout: (handler: () => void, timeout: number) => unknown
  clearTimeout: (handle: unknown) => void
}

const timers = (): Timers => globalThis as unknown as Timers

/**
 * Runs a timeline on Lynx using inline CSS transitions.
 *
 * ## Why transitions, and what that costs
 *
 * Lynx's newer builds have richer animation APIs, and none of them are in the
 * Element PAPI subset this host drives — they are engine globals whose names and
 * shapes move between versions, which is exactly the category this adapter
 * refuses to guess at (see the note on `createLynxHost`). A CSS transition,
 * however, is expressible through `__AddInlineStyle` alone. So this is the most
 * an adapter can do from the declared contract, and it is genuinely a lot: the
 * engine still owns the interpolation and still runs it off the JavaScript
 * thread, which is the entire point of the seam.
 *
 * What JavaScript keeps is the SEQUENCING — starting each leg, and knowing when
 * the last one is over. A transition has no completion callback reachable from
 * the PAPI, so the end of each leg is a timer. That is a real limitation and
 * worth stating plainly: under heavy load a timer can fire late, so a
 * multi-keyframe or repeating animation can drift, where a single tween cannot.
 * An app that needs frame-exact chaining should pass its engine's own animation
 * API in as {@link LynxHostOptions.animate}, which is precisely why that option
 * exists.
 *
 * @param api The Element PAPI to drive.
 * @param release Puts the element back to the style bag it owns, which is how
 *   every animation here ends. The host supplies it because only the host knows
 *   what that bag currently is.
 */
export const createTransitionAnimator = (
  api: LynxElementApi,
  release: (element: LynxElement) => void,
): NonNullable<Host['animate']> => {
  return (target: HostElement, keyframes: Keyframes, timing: AnimationTiming): HostAnimation => {
    const element = fromHostElement(target)
    const frames: readonly StyleValue[] = keyframes
    const legs = frames.length - 1
    // Split evenly across the legs, so `duration` means one pass through the
    // whole keyframe list rather than per hop — which is what it means in CSS
    // and in the Web Animations API, and a difference here would make the same
    // descriptor take twice as long on one target as on the other.
    const legDuration = timing.duration / legs
    const iterations = timing.iterations ?? 1
    const direction = timing.direction ?? 'normal'
    const easing = timing.easing ?? 'ease'

    let timer: unknown = null
    let ended = false
    let settle: (end: AnimationEnd) => void = () => {}
    const finished = new Promise<AnimationEnd>((resolve) => {
      settle = resolve
    })

    const stop = (how: AnimationEnd): void => {
      if (ended) return
      ended = true
      timers().clearTimeout(timer)
      // Both outcomes land here, and they are meant to. With no `fill` there is
      // no final frame to hold, so finishing and cancelling differ only in what
      // the caller is told — the element goes back to its own style either way,
      // which is the state that was already true before the animation started
      // moving it.
      release(element)
      settle(how)
    }

    const after = (ms: number, run: () => void): void => {
      timer = timers().setTimeout(run, ms)
    }

    /** The keyframe order for one iteration, which is all `direction` actually decides. */
    const sequence = (iteration: number): readonly StyleValue[] => {
      const backwards =
        direction === 'reverse' ||
        (direction === 'alternate' && iteration % 2 === 1) ||
        (direction === 'alternate-reverse' && iteration % 2 === 0)
      return backwards ? [...frames].reverse() : frames
    }

    const runLeg = (iteration: number, leg: number): void => {
      if (ended) return
      // An element that has left the tree cannot show anything, and on an
      // endless animation the timers would otherwise outlive the screen that
      // started them — a spinner on a disposed route quietly costing a wake-up
      // every frame forever. Stopping here means forgetting to cancel is a
      // missed `finished` at worst rather than a leak.
      if (api.__GetParent(element) === null) {
        stop('cancelled')
        return
      }

      const order = sequence(iteration)
      // The two ends of this leg. Present by construction — `legs` is derived
      // from the same array and `Keyframes` guarantees at least two entries —
      // but indexing is checked here, so they are read defensively rather than
      // asserted.
      const from = order[leg]
      const to = order[leg + 1]
      if (!from || !to) {
        stop('finished')
        return
      }

      // The origin has to land WITHOUT a transition, or the engine interpolates
      // its way to the starting position too and every leg begins with a slide
      // that nobody described.
      api.__AddInlineStyle(element, 'transition', 'none')
      applyFrame(api, element, from)
      // Committed before the destination is written, because a transition only
      // happens between two committed states — set both in one commit and the
      // engine sees a single jump to the destination.
      api.__FlushElementTree()

      after(0, () => {
        if (ended) return
        api.__AddInlineStyle(element, 'transition', `all ${legDuration}ms ${easing}`)
        applyFrame(api, element, to)
        api.__FlushElementTree()

        after(legDuration, () => {
          if (ended) return
          if (leg + 1 < legs) runLeg(iteration, leg + 1)
          // `Infinity` makes this always true, which is the whole implementation
          // of an endless animation — no special case needed.
          else if (iteration + 1 < iterations) runLeg(iteration + 1, 0)
          else stop('finished')
        })
      })
    }

    after(timing.delay ?? 0, () => runLeg(0, 0))

    return {
      finished,
      finish: () => stop(iterations === Number.POSITIVE_INFINITY ? 'cancelled' : 'finished'),
      cancel: () => stop('cancelled'),
    }
  }
}

/**
 * Writes one keyframe's declarations on top of whatever the element carries.
 *
 * Property by property rather than wholesale, so the element's own style bag
 * survives underneath and only the properties the animation actually mentions
 * are disturbed. `release` clears the lot by rewriting the bag.
 *
 * Keys take their CSS spelling, exactly as `setStyle` does — `__AddInlineStyle`
 * names one declaration, which is why this host calls it with `display` and
 * `transition` elsewhere. A keyframe written `{ backgroundColor: 'red' }` would
 * otherwise be dropped by the parser, and dropped silently: the animation would
 * still run its timers and resolve `finished`, having moved nothing.
 */
const applyFrame = (api: LynxElementApi, element: LynxElement, frame: StyleValue): void => {
  for (const [key, value] of Object.entries(frame)) {
    if (value === null || value === undefined || value === false) continue
    api.__AddInlineStyle(element, toCssName(key), toStyleText(key, value))
  }
}

const fromHostElement = (node: HostElement): LynxElement => node as unknown as LynxElement
