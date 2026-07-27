import { createContext } from '../composition/create-context'
import type { ReadonlySignal } from '../signals'
import { defaultTheme, type Theme } from './theme'

/**
 * How the theme reaches the component layer.
 *
 * The value is a SIGNAL rather than a `Theme`, and that is the load-bearing
 * part. A component runs exactly once here and therefore reads context exactly
 * once — so if the value were a plain theme, it would be whatever the theme was
 * at boot, forever. Holding the signal instead means every component reads it
 * once, keeps it, and goes on tracking it: a dark-mode switch reaches the whole
 * tree with no re-render, no invalidation pass, and no machinery beyond the
 * signal that was going to exist anyway.
 *
 * ```tsx
 * const theme = signal(light)
 * mount(root, () => ThemeContext.provide(theme, () => <App />))
 *
 * // and later, from anywhere
 * theme(dark)
 * ```
 *
 * Not providing one at all is a supported state, not a mistake — the fallback
 * is a real theme, so a component can be developed, tested, and rendered on its
 * own without an app around it.
 */
export const ThemeContext = createContext<ReadonlySignal<Theme>>(() => defaultTheme)
