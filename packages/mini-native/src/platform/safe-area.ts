import { requireHost } from '../current-host'
import type { Insets } from '../host'
import type { ReadonlySignal } from '../signals'

/** What a host with nothing eating into its edges reports. */
const NONE: ReadonlySignal<Insets> = () => ({ top: 0, right: 0, bottom: 0, left: 0 })

/**
 * How far in from each edge it is safe to draw, as a signal, in
 * density-independent pixels.
 *
 * The one piece of the environment with no real web counterpart and no way
 * around it on a device: a notch, a rounded corner, a status bar, and a home
 * indicator all eat into the screen, and content drawn underneath them is not
 * merely ugly, it is invisible. Live, because the values change on rotation and
 * when a keyboard appears.
 *
 * Reach for {@link Screen} before reaching for this. Applying insets is the
 * thing every native screen needs and every web page ignores, so it belongs in
 * one component rather than in every app — this is the seam that component is
 * built on, and the escape hatch for a layout that needs the numbers directly.
 *
 * Zeroes when the host cannot tell, which is also the honest answer on a
 * browser tab: there is nothing eating into it.
 */
export const safeArea = (): ReadonlySignal<Insets> => requireHost().environment?.safeArea ?? NONE
