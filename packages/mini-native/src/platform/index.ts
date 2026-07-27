/**
 * Saying "these two targets differ" — and, mostly, avoiding having to.
 *
 * Two things live here and they are in deliberate tension. {@link platform}
 * branches on the target's NAME; the environment accessors —
 * {@link colorScheme}, {@link dimensions}, {@link safeArea} — answer the
 * questions a name is usually standing in for.
 *
 * Prefer the second. Branching on a capability beats branching on an OS name,
 * because the name is a proxy for the thing you actually care about and proxies
 * rot: `os === 'web'` is quietly wrong the day a second web-shaped target
 * appears, and it is wrong in a way that typechecks. Safe area, viewport, and
 * colour scheme are exactly what an app would otherwise reach for a name to
 * infer, which is why a good environment API is what keeps `platform.select`
 * rare.
 *
 * There is no capability registry — no `canHover`, no `hasBackButton`. It would
 * be the better answer in principle, and designing the flag set before three
 * real branches exist would be guesswork rather than design. Worth revisiting
 * once there are three; the right flags will be obvious then.
 *
 * ## Everything here is a signal
 *
 * A component runs exactly once, so anything read as a plain value is frozen at
 * the moment the component was built. The environment accessors return SIGNALS,
 * and passing one along uncalled is what makes a rotation or a theme switch
 * update what read it — with no re-render and no invalidation machinery, the
 * same rule as every other reactive value in the package.
 *
 * ## Whole-component divergence is a bundler concern
 *
 * When a difference is structural rather than a leaf value, do not branch —
 * split the file. `Sheet.web.tsx` and `Sheet.native.tsx` need no runtime
 * support at all, only resolution order in the bundler:
 *
 * ```ts
 * // vite.config.ts
 * resolve: { extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js'] }
 * ```
 *
 * A whole file that is obviously platform-specific is reviewable, greppable,
 * and countable. An inline OS branch in the middle of a component is invisible
 * divergence, and it accumulates faster than anyone expects. Count the
 * platform-specific files: a number that climbs steadily means the abstraction
 * is in the wrong place, not that the app genuinely needed the branches.
 */

export { colorScheme } from './color-scheme'
export { dimensions } from './dimensions'
export { type PlatformChoices, platform } from './platform'
export { safeArea } from './safe-area'
