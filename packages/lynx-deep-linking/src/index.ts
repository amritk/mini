/**
 * `@amritk/lynx-deep-linking` — deep links for Lynx.
 *
 * Lynx ships no linking module. Its `NativeModules` object is an access point,
 * not a catalogue — the official answer to anything platform-shaped is "write
 * native code and send it into your Lynx code" — so that is what this package
 * is: an Android module, an iOS module, and a promise-shaped facade that
 * reaches them.
 *
 * ## The whole API, in one screen
 *
 * ```ts
 * // 1. background chunk — the bridge that carries every call
 * import { installNativeBridge } from '@amritk/mini-lynx-native/background'
 *
 * installNativeBridge()
 * ```
 *
 * ```tsx
 * // 2. the app root, on the main thread
 * import { getInitialURL, onDeepLink, openURL, parseURL } from '@amritk/lynx-deep-linking'
 * import { onCleanup } from '@amritk/mini-lynx'
 *
 * const open = (url: string) => router.navigate(parseURL(url).path)
 *
 * // The link that launched the app, and the ones that arrive later. Two
 * // mechanisms because they are two different moments — see `getInitialURL`.
 * getInitialURL().then((url) => { if (url) open(url) })
 * onCleanup(onDeepLink(({ url }) => open(url)))
 *
 * // And the outbound direction.
 * await openURL('https://example.com')
 * ```
 *
 * ## What the host app still owns
 *
 * The native side links itself: `lynx.lib.json` declares the Android and iOS
 * sources and Lynx's autolinking picks them up. What no library can do for you
 * is **declare your scheme** — that is a line in the host app's
 * `AndroidManifest.xml` and its `Info.plist`, naming a scheme this package
 * cannot know — and, on both platforms, forward the one runtime callback that
 * carries a link into a *running* app. `README.md` has all of it; there are
 * three snippets and none is longer than a line.
 *
 * A cold start needs none of that wiring on Android, and none on iOS outside a
 * scene-based app. That asymmetry is not a design: it is which callbacks each
 * platform lets a library observe, and `AGENTS.md` records exactly where the
 * line falls.
 *
 * ## Why there are no signals here
 *
 * Because a second edge onto the signal engine is how a consumer ends up with
 * two reactive graphs that cannot see each other's writes — a failure that
 * typechecks, runs, and silently stops updating. `@amritk/mini-helpers` is kept
 * off `alien-signals` for exactly this reason and both native-module packages
 * follow it: the surface is promises and subscriptions, and turning that into a
 * signal is one line in an app that already has one.
 *
 * ```ts
 * const link = signal<string | null>(null)
 * onCleanup(onDeepLink(({ url }) => link(url)))
 * ```
 *
 * It also means the package works unchanged from ReactLynx, Vue Lynx, or plain
 * background-thread code, which a signals-shaped API would not.
 */
export { canOpenURL } from './can-open-url'
export { createURL } from './create-url'
export { getInitialURL } from './get-initial-url'
export { isDeepLinkingAvailable } from './is-deep-linking-available'
export { EVENTS, MODULE } from './native-module'
export { onDeepLink } from './on-deep-link'
export { openSettings } from './open-settings'
export { openURL } from './open-url'
export { parseURL } from './parse-url'
export type { CreateURLOptions, DeepLink, OpenErrorCode, OpenResult, ParsedURL } from './types'
