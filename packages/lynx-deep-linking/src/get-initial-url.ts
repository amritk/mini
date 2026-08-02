import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'

/**
 * Resolves with the URL that launched this process, or `null` when the app was
 * started some other way.
 *
 * This is the cold-start half of deep linking and it cannot be an event. A link
 * that launches the app is delivered by the system before any JavaScript exists
 * to hear about it — which is precisely the case that matters, because it is
 * the one carrying a destination — so the native side records it and hands it
 * over when asked.
 *
 * ## It does not change, and it is never re-delivered as an event
 *
 * The answer is fixed for the lifetime of the process: a link that arrives
 * later goes to `onDeepLink` and does **not** become the new initial URL, and
 * the launch URL is never published to `onDeepLink`. That split is the same one
 * React Native draws, and it exists so an app can handle both without handling
 * either twice.
 *
 * The corollary is the mistake worth naming: this is not a "current link"
 * signal. Reading it on every screen mount re-runs the launch navigation on
 * every mount. Read it once, at the root, at startup.
 *
 * ## Both halves, together
 *
 * @example
 * ```ts
 * import { onCleanup } from '@amritk/mini-lynx'
 *
 * const open = (url: string) => router.navigate(parseURL(url).path)
 *
 * const initial = await getInitialURL()
 * if (initial) open(initial)
 * onCleanup(onDeepLink(({ url }) => open(url)))
 * ```
 */
export const getInitialURL = (): Promise<string | null> => callNativeAsync<string | null>(MODULE, 'getInitialURL')
