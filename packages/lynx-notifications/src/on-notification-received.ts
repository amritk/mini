import { onNativeEvent } from '@amritk/mini-lynx-native'

import { EVENTS } from './native-module'
import type { Notification } from './types'

/**
 * Subscribes to notifications that arrive **while the app is in the
 * foreground**, and returns the unsubscribe.
 *
 * This is the event neither platform turns into a banner for you. iOS asks its
 * delegate what to present and this module answers "nothing" — because a system
 * banner dropping over the screen the user is actively using is worse than
 * whatever in-app treatment you would design — and Android does not post a
 * heads-up for a foreground FCM message either. So this is where an in-app
 * toast, a badge on a tab, or a silent refresh belongs.
 *
 * A notification that arrives while the app is backgrounded does **not** come
 * through here. It goes to the system, and you hear about it only if the user
 * taps it, through `onNotificationResponse`.
 *
 * Register the unsubscribe with `onCleanup` — a screen that subscribes on build
 * and never lets go keeps its listener alive across every navigation.
 *
 * @example
 * ```ts
 * import { onCleanup } from '@amritk/mini-lynx'
 *
 * onCleanup(onNotificationReceived((notification) => toast(notification.title)))
 * ```
 */
export const onNotificationReceived = (listener: (notification: Notification) => void): (() => void) =>
  onNativeEvent(EVENTS.received, (payload) => listener(payload as Notification))
