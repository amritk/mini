import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { ScheduledNotification } from './types'

/**
 * Lists the notifications this app has scheduled and that have not fired yet.
 *
 * Already-delivered notifications are not in here, whether or not they are
 * still sitting in the notification centre — the two platforms keep those in a
 * separate list, and merging them would invent a state neither reports.
 *
 * Useful mostly for reconciliation: a settings screen that toggles a daily
 * reminder wants to know whether one is already pending rather than scheduling
 * a second.
 */
export const getScheduledNotifications = (): Promise<readonly ScheduledNotification[]> =>
  callNativeAsync<readonly ScheduledNotification[]>(MODULE, 'getScheduledNotifications')
