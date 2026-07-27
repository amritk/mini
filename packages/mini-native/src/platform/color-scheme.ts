import { requireHost } from '../current-host'
import type { ColorScheme } from '../host'
import type { ReadonlySignal } from '../signals'

/** What a host that cannot tell reports. Light is the assumption every platform starts from. */
const LIGHT: ReadonlySignal<ColorScheme> = () => 'light'

/**
 * Whether the target is presenting light or dark surfaces, as a signal.
 *
 * A signal and not a value, because a component runs exactly once: reading a
 * plain string would freeze the answer at the moment the component was built,
 * and the whole point of this is the switch that happens afterwards. Passing it
 * along uncalled is what keeps it live.
 *
 * ```tsx
 * const scheme = colorScheme()
 * <view style={() => ({ background: scheme() === 'dark' ? '#111' : '#fff' })} />
 * ```
 *
 * A host that cannot tell reports `light` forever, which is a documented
 * assumption rather than a promise — better than making every caller narrow an
 * optional for a fact most targets do know.
 */
export const colorScheme = (): ReadonlySignal<ColorScheme> => requireHost().environment?.colorScheme ?? LIGHT
