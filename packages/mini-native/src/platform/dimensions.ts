import { requireHost } from '../current-host'
import type { Dimensions } from '../host'
import type { ReadonlySignal } from '../signals'

/** What a host that cannot measure reports. Zero is the honest answer, not a guessed screen size. */
const NONE: ReadonlySignal<Dimensions> = () => ({ width: 0, height: 0 })

/**
 * The size of the area the app is drawn into, as a signal, in
 * density-independent pixels.
 *
 * Live, so a rotation or a resized window updates whatever read it without a
 * re-render. See {@link colorScheme} for why every field of the environment is
 * a signal rather than a value.
 *
 * Prefer laying things out with flex over branching on a measurement. This is
 * for the cases where that genuinely is not enough — deciding how many columns
 * a grid gets, or whether a master-detail split is worth showing — and reaching
 * for it to do ordinary layout is a sign the layout wanted a different shape.
 *
 * A host that cannot measure reports zeroes, which is deliberately a value no
 * layout will accidentally look right against: a guessed 375×667 would read as
 * a real phone and be wrong in a way nobody would notice.
 */
export const dimensions = (): ReadonlySignal<Dimensions> => requireHost().environment?.dimensions ?? NONE
