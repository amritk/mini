import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { NotificationRequest } from './types'

/**
 * Posts a notification, or schedules one, and resolves with the id it was filed
 * under.
 *
 * With no `trigger` the notification is delivered immediately. Note what
 * "immediately" means on both platforms: a notification delivered while your
 * own app is in the foreground does **not** appear as a banner by default — it
 * arrives at `onNotificationReceived` instead, and showing something is your
 * app's job. That is not a bug to work around; a banner covering the screen the
 * user is already looking at is worse.
 *
 * The returned id is the one to pass to `cancelNotification`. Supplying your
 * own `id` and reusing it replaces the existing notification, which is how a
 * live one gets updated.
 *
 * @example
 * ```ts
 * const id = await scheduleNotification({
 *   title: 'Standup',
 *   body: 'In five minutes',
 *   trigger: { type: 'timeInterval', seconds: 300 },
 *   data: { screen: 'calendar' },
 * })
 * ```
 */
export const scheduleNotification = (request: NotificationRequest): Promise<string> =>
  callNativeAsync<string>(MODULE, 'scheduleNotification', request)
