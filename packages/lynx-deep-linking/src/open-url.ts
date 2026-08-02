import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { OpenResult } from './types'

/**
 * Hands a URL to the system and resolves with whether it went somewhere.
 *
 * This is the outbound direction: `https:` opens the browser, `mailto:` the
 * mail client, `tel:` the dialler, and another app's scheme that app. The
 * result is a discriminated union rather than a throw — see `OpenResult` — so
 * every call site has the same shape.
 *
 * ## The failure that looks like a bug in this package
 *
 * `{ ok: false, error: 'noHandler' }` for a scheme you can see working when you
 * type it into the browser is almost always the host app's manifest, not the
 * device:
 *
 * - **Android 11+** hides other apps from yours unless the host app declares
 *   what it wants to see. This library declares `<queries>` for `https`,
 *   `mailto`, `tel` and `sms`, which covers the common cases; **any other
 *   scheme needs an entry in the host app's own manifest.**
 * - **iOS** answers `canOpenURL:` with false for any scheme not in the host
 *   app's `LSApplicationQueriesSchemes`, and `openURL:` for an undeclared
 *   scheme is at the system's discretion.
 *
 * Neither is something a library can do on an app's behalf, because both are a
 * declaration about what *that app* wants to reach. The README has the exact
 * snippets.
 *
 * ## It is not a navigation
 *
 * A URL that this app itself handles still goes out to the system and comes
 * back in as an `onDeepLink` event on Android; it does not shortcut into your
 * router. Route internally with your router and keep this for URLs that leave.
 *
 * @example
 * ```ts
 * const result = await openURL('https://example.com/help')
 * if (!result.ok) showInlineHelpInstead()
 * ```
 */
export const openURL = (url: string): Promise<OpenResult> => callNativeAsync<OpenResult>(MODULE, 'openURL', url)
