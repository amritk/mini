import { requireHost } from '../current-host'
import type { ReadonlySignal } from '../signals'

/**
 * What a host that cannot tell reports.
 *
 * `false` rather than `true`, which is the one debatable call in this file. A
 * target that has not said is far more likely to be one nobody has taught to
 * answer than one whose user has actually asked for less motion, and defaulting
 * the other way would mean every app on every unteached host shipped with its
 * animations silently off — a bug that looks like the framework being broken
 * rather than like a setting being honoured.
 */
const NO: ReadonlySignal<boolean> = () => false

/**
 * Whether the user has asked the system to cut down on motion, as a signal.
 *
 * Reading this by hand is the exception rather than the rule: `animate` already
 * honours it, so an animation started through this package is skipped without
 * any call site asking. Reach for it when the motion is something the runtime
 * cannot see — a video that autoplays, a carousel that advances itself, a
 * parallax bound to a scroll offset.
 *
 * ```tsx
 * const still = reduceMotion()
 * <video autoplay={() => !still()} />
 * ```
 *
 * A host that cannot tell reports `false` forever — the same shape of
 * documented assumption as `colorScheme`, and see above for why it defaults the
 * way it does.
 */
export const reduceMotion = (): ReadonlySignal<boolean> => requireHost().environment?.reduceMotion ?? NO
