import { onNativeEvent } from '@amritk/mini-lynx-native'

import { EVENTS } from './native-module'
import type { DeviceToken } from './types'

/**
 * Subscribes to the remote-push token being issued or rotated, and returns the
 * unsubscribe.
 *
 * Pair it with `getDeviceToken`: the call covers the token that already exists,
 * and this covers every one after it. Both paths should do the same thing —
 * send it to your backend — because a rotation the backend never hears about is
 * a device that silently stops receiving push.
 *
 * @example
 * ```ts
 * import { onCleanup } from '@amritk/mini-lynx'
 *
 * onCleanup(onDeviceToken((token) => api.registerPushToken(token.token, token.service)))
 * ```
 */
export const onDeviceToken = (listener: (token: DeviceToken) => void): (() => void) =>
  onNativeEvent(EVENTS.token, (payload) => listener(payload as DeviceToken))
