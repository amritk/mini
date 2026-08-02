import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'

/**
 * Answers whether anything on the device claims to handle this URL.
 *
 * The honest use for this is deciding what to *show*: a "message us on
 * WhatsApp" button is worth hiding when WhatsApp is not installed, and worth
 * showing when it is. Using it as a guard before `openURL` is mostly wasted —
 * `openURL` reports `noHandler` for the same condition, in one call, without a
 * window in which the answer could change.
 *
 * ## A false here usually means "not declared", not "not installed"
 *
 * Both platforms treat this as a query about other apps and both gate it:
 * Android 11+ hides packages your manifest never asked about, and iOS answers
 * false for any scheme missing from `LSApplicationQueriesSchemes` — with a
 * hard cap of 50 entries, so it is not a list to fill speculatively. This
 * library declares the four schemes every app uses (`https`, `mailto`, `tel`,
 * `sms`); anything else is a line in the host app's manifest or `Info.plist`,
 * and the README has both.
 *
 * A `false` is therefore never proof that an app is missing. It is proof that
 * *this* app cannot see it.
 *
 * @example
 * ```ts
 * const canWhatsApp = await canOpenURL('whatsapp://send?phone=15550100')
 * // requires `whatsapp` in LSApplicationQueriesSchemes and in <queries>
 * ```
 */
export const canOpenURL = (url: string): Promise<boolean> => callNativeAsync<boolean>(MODULE, 'canOpenURL', url)
