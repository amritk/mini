/**
 * Motion, described once and handed to the engine.
 *
 * ## Why this is a seam rather than a library
 *
 * The obvious way to animate in a signals runtime is to write the value sixty
 * times a second and let the bindings carry it to the screen. It works, it is
 * about ten lines, and it is the wrong shape: every frame becomes a property
 * write from JavaScript, and on a native target every property write is a bridge
 * crossing. The animation then runs at whatever rate the JavaScript thread has
 * left over, which is exactly the moment — a screen transition, a list settling,
 * a gesture releasing — when it has least to spare.
 *
 * So the timeline is described in one call and handed over. What the engine does
 * with it is the host's business: the DOM host passes it to the Web Animations
 * API, the Lynx host expresses it as inline transitions, and both then run it
 * off the JavaScript thread entirely.
 *
 * ## The rule that makes it composable
 *
 * **The signal is the state; the animation is only how it gets there.** An
 * animation never leaves a style behind — the element is released back to its
 * own style bag when the timeline ends, however it ends. Write the settled value
 * first, then animate from wherever the element used to be.
 *
 * That single rule is what buys everything else. It is why reduced motion can be
 * honoured by simply not running the animation, why a host with no `animate` is
 * a host with instant transitions rather than a broken app, and why a test
 * against the memory host asserts the same final tree the device shows. An
 * animation that owned its end state would break all three at once.
 *
 * @example
 * ```tsx
 * import { animate } from '@amritk/mini-native/animate'
 *
 * let row!: HostElement
 * const dismiss = async () => {
 *   await animate(row, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).finished
 *   rows(rows().filter((r) => r.id !== id))
 * }
 * ```
 */

export type { AnimationEnd, AnimationTiming, HostAnimation, Keyframes } from '../host'
export { type AnimateOptions, type Animation, animate } from './animate'
