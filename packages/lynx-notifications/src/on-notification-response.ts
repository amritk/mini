import { callNative, onNativeEvent } from '@amritk/mini-lynx-native'

import { EVENTS, MODULE } from './native-module'
import type { NotificationResponse } from './types'

/**
 * Subscribes to the user acting on a notification — tapping it, or using one of
 * its actions — and returns the unsubscribe.
 *
 * This is the one that routes: `response.notification.data` carries whatever
 * the notification was sent with, which is where a screen name or an entity id
 * belongs.
 *
 * ## The cold-start tap, and why it still arrives
 *
 * A tap that *launches* the app happens before any JavaScript exists to hear
 * about it, so a naive implementation loses exactly the interaction that
 * matters most — the one carrying a destination.
 *
 * The native module holds such a response instead of publishing it into an
 * empty process, and subscribing here asks it to replay one. The asking is
 * explicit because native code cannot see when a bundle has finished
 * subscribing, and any delay long enough to be safe would be long enough to be
 * visible.
 *
 * The held response is delivered **once**, to whoever subscribes first. That
 * makes the placement of this call matter: subscribe at the app root, during
 * the first render, not on the screen the notification points at — that screen
 * does not exist yet, which is the whole problem.
 *
 * @example
 * ```ts
 * import { onCleanup } from '@amritk/mini-lynx'
 *
 * onCleanup(
 *   onNotificationResponse(({ notification }) => {
 *     const screen = notification.data['screen']
 *     if (typeof screen === 'string') router.navigate(screen)
 *   }),
 * )
 * ```
 */
export const onNotificationResponse = (listener: (response: NotificationResponse) => void): (() => void) => {
  const stop = onNativeEvent(EVENTS.response, (payload) => listener(payload as NotificationResponse))
  // Subscribe first, then ask — the other order races the replay against the
  // subscription and would drop exactly the event this is here to deliver.
  //
  // The rejection is swallowed rather than surfaced: the only reasons this
  // fails are that the module is not linked or the app is running against an
  // older native half, neither of which is worth an unhandled rejection on a
  // thread where nothing is listening for one.
  void callNative<void>(MODULE, 'flushPendingResponse').catch(() => {})
  return stop
}
