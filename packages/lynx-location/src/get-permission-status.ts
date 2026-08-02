import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { LocationPermissionStatus } from './types'

/**
 * Reads whether the app may use location, without prompting.
 *
 * Always check before requesting. On both platforms a request made after the
 * user has already refused shows nothing and resolves `denied` immediately, so
 * an app that prompts unconditionally on launch is an app that prompts forever
 * and never succeeds. Branch on `undetermined` to decide whether asking is
 * worth doing at all.
 *
 * This says nothing about whether location is switched on device-wide — a
 * `granted` app on a device with location services off still cannot have a fix.
 * `isLocationEnabled` is that question.
 *
 * @example
 * ```ts
 * const status = await getPermissionStatus()
 * if (status === 'undetermined') await requestPermission()
 * else if (status === 'denied') showSettingsHint()
 * ```
 */
export const getPermissionStatus = (): Promise<LocationPermissionStatus> =>
  callNativeAsync<LocationPermissionStatus>(MODULE, 'getPermissionStatus')
