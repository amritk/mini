import { requireHost } from '../current-host'

/**
 * What a {@link platform.select} call may be keyed by.
 *
 * `native` is the one entry that is not an OS name. It matches any target that
 * named itself and is not the web — which is the branch apps actually reach
 * for, since the interesting difference is nearly always "browser or device"
 * rather than which device.
 *
 * A target that named itself nothing does NOT match `native`. Guessing would be
 * the wrong kind of helpful: a host that has not said what it is has not said
 * it is a device either, so it falls through to `default`.
 */
export type PlatformChoices<T> = {
  [os: string]: T | undefined
  /** Picked on the DOM host. */
  web?: T
  /** Picked on any target that named itself and is not the web. */
  native?: T
  /** Picked when nothing above matched. */
  default?: T
}

/** What {@link platform} exposes. Written out so the doc comments survive into an editor. */
type Platform = {
  /**
   * How the installed host names itself — `web`, `lynx`, `memory`, or whatever
   * a new host chose. `unknown` when the host did not say.
   *
   * Read live rather than captured, so swapping hosts (a test, a hot reload)
   * is reflected immediately. Reading it before `setHost` is a boot-order
   * mistake and throws, exactly as rendering before `setHost` does.
   */
  readonly os: string
  select: <T>(choices: PlatformChoices<T>) => T | undefined
}

/**
 * Which target this is, and a way to pick a value per target.
 *
 * ```ts
 * platform.os                                       // 'web' | 'lynx' | 'memory' | …
 * platform.select({ web: 12, native: 16, default: 14 })
 * ```
 *
 * **Reach for this last.** An OS name is a proxy for the thing you actually
 * care about — whether there is a notch, whether hover exists, whether anything
 * is addressable — and a good environment API answers those directly. Branching
 * on the name is what you do when nothing better is available, and it is the
 * kind of code that is quietly wrong the day a second target of the same shape
 * appears.
 *
 * When you do branch, keep it to LEAF VALUES: a padding, a duration, a line
 * count. Anything structural belongs in a `.web.tsx` / `.native.tsx` pair,
 * because a whole file that is obviously platform-specific is reviewable,
 * greppable, and countable, while an inline branch in the middle of a component
 * is invisible divergence — and invisible divergence accumulates faster than
 * anyone expects. Counting the platform-specific files is the only honest
 * measure of whether write-once is still holding.
 */
export const platform: Platform = {
  get os(): string {
    return requireHost().platform ?? 'unknown'
  },

  /**
   * Picks the entry matching this target: an exact OS name first, then `native`
   * for any named non-web target, then `default`.
   *
   * Returns `undefined` when nothing matched, which is why `default` is worth
   * providing for anything that is not genuinely optional.
   */
  select: <T>(choices: PlatformChoices<T>): T | undefined => {
    const os = platform.os
    // `hasOwn` rather than `in`, so a host that named itself `toString` picks
    // up nothing from the object prototype.
    if (Object.hasOwn(choices, os)) return choices[os]
    if (os !== 'unknown' && os !== 'web' && choices.native !== undefined) return choices.native
    return choices.default
  },
}
