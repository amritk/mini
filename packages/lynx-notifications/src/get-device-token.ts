import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { DeviceToken } from './types'

/**
 * Registers for remote push and resolves with the device token, or `null` if
 * one could not be obtained.
 *
 * `null` is a normal outcome rather than an error: the user may have refused
 * notifications, the device may be offline at registration, an iOS simulator
 * without a paired Mac has no APNs at all, and an Android build with no
 * `google-services.json` has no FCM. None of those are worth throwing over, and
 * all of them can resolve later — which is what `onDeviceToken` is for.
 *
 * ## Send it to your backend every time, not once
 *
 * The token is not an identifier for the device or the user. iOS reissues it on
 * reinstall and on restore-to-new-device; FCM rotates it on its own schedule.
 * The correct shape is: call this at startup, subscribe with `onDeviceToken`,
 * and POST whatever arrives to your backend each time. Storing the first token
 * and assuming it holds is the reason "push stopped working for some users"
 * takes weeks to find.
 *
 * This package is deliberately transport-agnostic about what happens next —
 * pair it with APNs and FCM directly, or with anything that fronts them.
 *
 * @example
 * ```ts
 * const token = await getDeviceToken()
 * if (token) await api.registerPushToken(token.token, token.service)
 * ```
 */
export const getDeviceToken = (): Promise<DeviceToken | null> =>
  callNativeAsync<DeviceToken | null>(MODULE, 'getDeviceToken')
