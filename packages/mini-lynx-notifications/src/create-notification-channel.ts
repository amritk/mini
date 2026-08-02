import { callNative } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { NotificationChannel } from './types'

/**
 * Creates an Android notification channel. A no-op on iOS, so it is safe to
 * call unconditionally at startup.
 *
 * ## Why this is not optional on Android
 *
 * Since Android 8, a notification posted to a channel that does not exist is
 * **dropped without a word** — no exception, no log an app developer would
 * find, nothing on screen. It is the single most common way notifications
 * "just don't work" on Android. The native module creates a default channel on
 * demand so that an app which never calls this still delivers, but any app with
 * more than one kind of notification wants its own channels: the channel is the
 * unit the *user* controls in system settings, so putting order updates and
 * marketing on the same one means turning off either turns off both.
 *
 * Creating a channel that already exists updates only its name and description.
 * Importance and the rest are frozen at creation — see {@link NotificationChannel}.
 *
 * @example
 * ```ts
 * await createNotificationChannel({
 *   id: 'reminders',
 *   name: 'Reminders',
 *   description: 'Nudges for things you asked to be reminded about',
 *   importance: 'high',
 * })
 * ```
 */
export const createNotificationChannel = (channel: NotificationChannel): Promise<void> =>
  callNative<void>(MODULE, 'createNotificationChannel', channel)
