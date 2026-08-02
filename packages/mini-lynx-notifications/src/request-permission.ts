import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { PermissionRequest, PermissionStatus } from './types'

/**
 * Prompts for permission to post notifications, and resolves with what the user
 * decided.
 *
 * ## You get one prompt, ever
 *
 * This is the part worth designing around rather than discovering. iOS shows
 * the system prompt for `UNUserNotificationCenter` **once per install**; a
 * second request resolves with the existing answer and displays nothing.
 * Android 13+ behaves the same way for `POST_NOTIFICATIONS` after two
 * dismissals. So the prompt is a one-shot resource: spend it at a moment where
 * the user already understands why the app wants it, not on first launch.
 *
 * A `denied` result is final as far as this API is concerned. The only way back
 * is the system settings app, which is why the honest response to `denied` is
 * an explanation and a link, not a retry.
 *
 * ## Platform differences that will bite
 *
 * - **Android below 13** has no runtime permission at all: notifications are
 *   granted at install and this resolves `granted` without showing anything.
 * - **`provisional`** is iOS-only and shows no prompt. It grants quiet delivery
 *   straight to the notification centre, which is a genuinely good way to earn
 *   a full grant later — but it does not spend the prompt, and a subsequent
 *   normal request still shows one.
 *
 * @example
 * ```ts
 * const status = await requestPermission({ alert: true, sound: true, badge: false })
 * if (status !== 'granted') explainWhyNotificationsMatter()
 * ```
 */
export const requestPermission = (request: PermissionRequest = {}): Promise<PermissionStatus> =>
  callNativeAsync<PermissionStatus>(MODULE, 'requestPermission', request)
