import { callNative } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'

/**
 * Cancels a scheduled notification and removes any already-delivered copy of it
 * from the notification centre.
 *
 * Both halves are deliberate: a notification that has already fired is still
 * sitting in the shade, and cancelling only the pending one leaves the user
 * looking at something the app considers gone.
 *
 * Cancelling an id that does not exist is not an error on either platform, so
 * this resolves either way. There is no way to ask "did that cancel anything",
 * and building one on top of `getScheduledNotifications` would be a race
 * rather than an answer.
 */
export const cancelNotification = (id: string): Promise<void> => callNative<void>(MODULE, 'cancelNotification', id)
