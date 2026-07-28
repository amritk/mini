import { signal } from './signals'

/**
 * The values the host app pushed in from native, as one signal the whole tree
 * can read.
 *
 * ## Why the runtime owns this rather than the app
 *
 * `globalProps` is how a Lynx app hands the page things only the platform
 * knows — colour scheme, locale, the reduced-motion preference, feature flags,
 * a signed-in user id — and the engine hands them over twice, in two different
 * ways. The initial bag is a plain global (`lynx.__globalProps`) readable at
 * startup, and every later change arrives by the engine **calling** a global
 * `updateGlobalProps` that the framework is expected to define.
 *
 * An app can read the first of those on its own. It cannot usefully own the
 * second: the engine calls one function, so exactly one thing in the process
 * may define it, and a component that wanted to react to a theme change would
 * have to hope it was the one that got there. Worse, defining it *late* — after
 * the entry point has already run — races the engine's first update.
 *
 * So the runtime claims the slot once, in `renderPage`, and turns it into what
 * everything else here already is: a signal. Reading it inside a binding means
 * the tree follows the platform without anything being threaded through it.
 *
 * ```tsx
 * type Props = { theme: 'light' | 'dark' }
 *
 * const Screen = () => <view class={() => `screen ${globalProps<Props>().theme}`} />
 * ```
 *
 * ## The typing
 *
 * A type parameter rather than an augmentable interface, because the shape is
 * the *app's* — agreed with its own native side — and there is no version of it
 * this package could usefully declare. Pass your own type at the read site, or
 * wrap it once in a helper of your own and let inference do the rest.
 */
const props = signal<Readonly<Record<string, unknown>>>({})

/**
 * Reads the current bag. Tracks, so a binding re-runs when the platform pushes
 * a change.
 *
 * The default is an empty object rather than `undefined`, so a read of a
 * property is safe before the platform has said anything — which is the whole
 * of the first frame, and on some engine versions rather longer.
 */
export const globalProps = <T extends Record<string, unknown> = Record<string, unknown>>(): Readonly<T> =>
  props() as Readonly<T>

/**
 * Replaces the bag.
 *
 * `renderPage` calls this for you — once with `lynx.__globalProps` at startup
 * and again for every `updateGlobalProps` the engine sends — so an app normally
 * never does. It is exported for the two cases that are not that: a test that
 * wants a screen rendered against particular platform values, and an app whose
 * entry point is its own rather than this package's.
 *
 * The bag is replaced wholesale rather than merged, because that is what the
 * engine sends: `updateGlobalProps` carries the complete set, and merging would
 * make a removed key linger forever.
 */
export const setGlobalProps = (next: Readonly<Record<string, unknown>>): void => {
  props(next)
}
