import { requireHost } from '../current-host'
import type { AnimationEnd, AnimationTiming, HostAnimation, Keyframes } from '../host'
import type { HostElement } from '../types'
import { untrack } from '../untrack'

/** Everything {@link animate} takes beyond the keyframes. */
export type AnimateOptions = AnimationTiming & {
  /**
   * Run even when the user has asked the system for reduced motion.
   *
   * Almost nothing qualifies, and the bar is deliberately the accessibility
   * guidelines' own: motion is essential when removing it would remove
   * INFORMATION, not when removing it would make the app feel cheaper. A
   * progress indicator that only conveys progress by moving is essential; a
   * screen transition, a bouncing button, and a parallax header are not, however
   * much work went into them.
   */
  readonly essential?: boolean
}

/** A running animation. See {@link animate}. */
export type Animation = HostAnimation

/**
 * The handle returned when nothing is going to run.
 *
 * It reports `finished` rather than `cancelled`, and that is the whole reason
 * skipping is safe: whatever the caller queued behind the animation — removing
 * the toast, releasing the lock, advancing the tour — still happens, and happens
 * at once. A skipped animation must be indistinguishable from an instant one, or
 * every call site would have to learn which hosts can animate.
 */
const skipped = (): Animation => ({
  cancel: () => {},
  finish: () => {},
  finished: Promise.resolve<AnimationEnd>('finished'),
})

/**
 * Animates an element between two or more style bags, letting the engine own
 * the timeline.
 *
 * ```tsx
 * let sheet!: HostElement
 * const open = signal(false)
 *
 * const show = async () => {
 *   open(true)                                  // the state — this is the truth
 *   await animate(sheet, [{ translateY: 320 }, { translateY: 0 }], { duration: 240 }).finished
 * }
 * ```
 *
 * Three things about it are worth knowing up front, because each one is a
 * decision rather than an accident:
 *
 * **The animation is never the state.** It ends by releasing the element back to
 * its own style, so the settled value has to be written separately — as above,
 * where `open(true)` is what makes the sheet open and the animation is only how
 * it arrives. See `AnimationTiming` for why the alternative was rejected. This
 * is what makes every following point safe.
 *
 * **It is skipped, not degraded, when it cannot run.** A host with no `animate`
 * and a user who asked for reduced motion take the same path: nothing moves, the
 * returned `finished` resolves immediately, and the element is already showing
 * what it should. Nobody has to branch on either.
 *
 * **It is a call, not a prop.** The same reasoning as `focus`: an
 * `animating={true}` prop has no honest meaning once the animation has ended and
 * the prop still says `true`. An animation is something that HAPPENS.
 *
 * Reach for the element through `ref`, which is the seam for anything
 * imperative. A long-lived animation — anything with `iterations: Infinity` —
 * should be cancelled when its owner goes away:
 *
 * ```tsx
 * const Spinner = () => {
 *   let disc!: HostElement
 *   const view = <view ref={(element) => { disc = element }} />
 *   const spin = animate(disc, [{ rotate: '0deg' }, { rotate: '360deg' }], {
 *     duration: 900,
 *     iterations: Number.POSITIVE_INFINITY,
 *     easing: 'linear',
 *   })
 *   onCleanup(spin.cancel)
 *   return view
 * }
 * ```
 */
export const animate = (element: HostElement, keyframes: Keyframes, options: AnimateOptions): Animation => {
  const host = requireHost()
  if (!host.animate) return skipped()

  const { essential, ...timing } = options
  // Untracked on purpose. Starting an animation from inside an effect is
  // unusual but legal — a `watch` on the route, say, animating the outgoing
  // screen — and subscribing that effect to the motion preference would make
  // toggling the setting re-run whatever the effect does, which is nothing the
  // caller asked for and rarely idempotent.
  if (essential !== true && untrack(() => host.environment?.reduceMotion?.() === true)) return skipped()

  return host.animate(element, keyframes, timing)
}
