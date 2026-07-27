import { colorScheme } from '../platform/color-scheme'
import type { ReadonlySignal } from '../signals'
import { darkTheme, defaultTheme, type Theme } from './theme'

/**
 * A theme that follows the platform's light and dark surfaces, as a signal you
 * hand straight to `ThemeContext.provide`.
 *
 * ```tsx
 * mount(root, () => ThemeContext.provide(systemTheme(), () => <App />))
 *
 * // or with your own pair
 * mount(root, () => ThemeContext.provide(systemTheme(brand, brandDark), () => <App />))
 * ```
 *
 * ## Why this is a function and not a constant
 *
 * `colorScheme()` reads the installed host, so the answer does not exist until
 * one is installed. Calling this at module scope would therefore throw in the
 * one place people are most tempted to put it. Called from the app root — where
 * everything else that needs a host is already called — it is a single line.
 *
 * ## Why it returns a plain getter rather than a `computed`
 *
 * A `computed` earns its keep by not recomputing an expensive derivation for
 * every reader. This derivation is one comparison and a branch between two
 * objects that already exist, so memoising it would cost more than it saves,
 * both in bytes and in the node the graph would carry. What matters is that it
 * is a GETTER: read inside a component's style getter it tracks `colorScheme()`
 * and goes on tracking it, which is the entire mechanism by which the switch
 * reaches a tree that never re-renders.
 *
 * A host that cannot tell reports `light` forever — see `colorScheme` — so this
 * degrades to `light` on the memory host rather than needing a branch.
 *
 * @param light Used when the platform is presenting light surfaces.
 * @param dark Used when it is presenting dark ones.
 */
export const systemTheme = (light: Theme = defaultTheme, dark: Theme = darkTheme): ReadonlySignal<Theme> => {
  const scheme = colorScheme()
  return () => (scheme() === 'dark' ? dark : light)
}
