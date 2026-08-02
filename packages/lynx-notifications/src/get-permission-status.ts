import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { PermissionStatus } from './types'

/**
 * Reads whether the app may post notifications, without prompting.
 *
 * Always check before requesting. On both platforms a request made after the
 * user has already refused shows nothing and resolves `denied` immediately, so
 * an app that prompts unconditionally on launch is an app that prompts forever
 * and never succeeds. Branch on `undetermined` to decide whether asking is
 * worth doing at all.
 *
 * @example
 * ```ts
 * const status = await getPermissionStatus()
 * if (status === 'undetermined') await requestPermission()
 * else if (status === 'denied') showSettingsHint()
 * ```
 */
export const getPermissionStatus = (): Promise<PermissionStatus> =>
  callNativeAsync<PermissionStatus>(MODULE, 'getPermissionStatus')
