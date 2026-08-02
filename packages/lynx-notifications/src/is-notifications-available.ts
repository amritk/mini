import { isNativeModuleAvailable } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'

/**
 * Answers whether the notifications native module is linked into this host app.
 *
 * A Lynx bundle can run inside a host that autolinked this library and a host
 * that did not, and the difference is invisible until something calls it. This
 * is the check that turns "the notifications screen does nothing" into a branch
 * you wrote: hide the screen, or show why it is unavailable.
 *
 * It says nothing about permission — a linked module with a `denied` status is
 * available. Use `getPermissionStatus` for that.
 */
export const isNotificationsAvailable = (): Promise<boolean> => isNativeModuleAvailable(MODULE)
