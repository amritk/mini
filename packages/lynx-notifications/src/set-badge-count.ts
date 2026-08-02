import { callNative } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'

/**
 * Sets the number on the app icon's badge. Zero clears it.
 *
 * Nothing keeps this in step with what is in the notification centre — the
 * badge is a number the app owns, not a count the system derives — so an app
 * that wants them to agree has to clear it, usually when the relevant screen is
 * opened.
 *
 * On Android the effect depends on the launcher, which may show a dot, a count,
 * or nothing. Treat it as a hint there and as exact on iOS.
 */
export const setBadgeCount = (count: number): Promise<void> => callNative<void>(MODULE, 'setBadgeCount', count)
