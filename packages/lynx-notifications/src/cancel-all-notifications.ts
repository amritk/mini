import { callNative } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'

/**
 * Cancels every notification this app scheduled, and clears everything it has
 * already delivered.
 *
 * The usual caller is sign-out, where leaving a stranger's reminders on the
 * lock screen is a privacy problem rather than an untidiness. It cannot touch
 * another app's notifications, only this one's.
 */
export const cancelAllNotifications = (): Promise<void> => callNative<void>(MODULE, 'cancelAllNotifications')
