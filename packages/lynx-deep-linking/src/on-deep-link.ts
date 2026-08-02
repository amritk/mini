import { callNative, onNativeEvent } from '@amritk/mini-lynx-native'

import { EVENTS, MODULE } from './native-module'
import type { DeepLink } from './types'

/**
 * Subscribes to URLs handed to the app **while it is running**, and returns the
 * unsubscribe.
 *
 * The link that launched the app is not one of these — it is
 * `getInitialURL`'s, because it happened before this process could listen. An
 * app wants both, and wiring them together is four lines; the example on
 * `getInitialURL` is those four lines.
 *
 * ## The link that arrives with the screen gone
 *
 * A link can be delivered when the process is alive but no LynxView is: an
 * Android activity destroyed behind a backgrounded app is the ordinary case,
 * and it is not a cold start, so `getInitialURL` will not carry it either.
 * Native code holds such a link rather than publishing it into nothing, and
 * subscribing here asks for the held one. The asking is explicit — the same
 * bargain `@amritk/lynx-notifications` makes for a cold-start tap — because
 * native code cannot see when a bundle has finished subscribing, and any delay
 * long enough to be safe would be long enough to be visible.
 *
 * One link is held, the most recent, and it is delivered **once** to whoever
 * subscribes first. Subscribe at the app root during the first render rather
 * than on the screen the link points at — that screen does not exist yet, which
 * is the whole problem.
 *
 * @example
 * ```ts
 * import { onCleanup } from '@amritk/mini-lynx'
 *
 * onCleanup(
 *   onDeepLink(({ url }) => {
 *     const { path, query } = parseURL(url)
 *     if (path === '/order') router.navigate(`/order/${query['id']}`)
 *   }),
 * )
 * ```
 */
export const onDeepLink = (listener: (link: DeepLink) => void): (() => void) => {
  const stop = onNativeEvent(EVENTS.link, (payload) => listener(payload as DeepLink))
  // Subscribe first, then ask — the other order races the replay against the
  // subscription and would drop exactly the link this is here to deliver.
  //
  // The rejection is swallowed rather than surfaced: the only reasons this
  // fails are that the module is not linked or the app is running against an
  // older native half, neither of which is worth an unhandled rejection on a
  // thread where nothing is listening for one.
  void callNative<void>(MODULE, 'flushPendingLink').catch(() => {})
  return stop
}
