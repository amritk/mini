import { signal } from './signals'

/**
 * Whether the user has asked for reduced motion, as one signal the whole app
 * reads.
 *
 * ## Why this is in the runtime rather than in the app
 *
 * It was in the app for one release, and that was the mistake. The deleted
 * `/animate` layer read the preference off its host and skipped a non-essential
 * timeline on its own, so honouring it cost an app nothing. When that layer went,
 * so did the reading — and "the app passes no `transition` while the preference
 * is set" is worse ergonomics for an accessibility feature, which is exactly the
 * kind of thing that quietly stops being done. Making it free again is the point:
 * an app states the preference once, and `RouteStack` and anything else that
 * moves honours it without being asked twice.
 *
 * ## Why the app still has to supply the value
 *
 * Because the engine does not offer one. There is no reduced-motion field on
 * `SystemInfo` in `@lynx-js/types`, and no CSS `prefers-reduced-motion` — Lynx
 * has no media queries at all. The preference is a platform capability the host
 * app reads natively and passes in, usually through `globalProps` or a native
 * module, exactly as it does for colour scheme.
 *
 * So the runtime cannot read it, and does not pretend to. What it can do is give
 * the value ONE home, so that supplying it is a single line at startup instead of
 * a prop threaded through every animated component.
 *
 * @example
 * ```ts
 * // Once, at startup — wherever your host app puts the preference.
 * setReducedMotion(lynx.__globalProps?.reduceMotion === true)
 * ```
 */
const reduced = signal(false)

/**
 * Reads the preference. Tracks, so an effect re-runs when it changes — a
 * preference can be toggled while the app is open, and on iOS routinely is.
 */
export const reducedMotion = (): boolean => reduced()

/**
 * States the preference. Call it at startup, and again if the platform reports a
 * change.
 *
 * Defaults to `false` rather than to anything cleverer, because a runtime that
 * guessed would be wrong silently in the direction that hurts: an app that never
 * calls this animates, which is what it did before this existed.
 */
export const setReducedMotion = (value: boolean): void => {
  reduced(value)
}
