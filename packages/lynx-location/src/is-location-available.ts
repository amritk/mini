import { isNativeModuleAvailable } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'

/**
 * Answers whether the location native module is linked into this host app.
 *
 * A Lynx bundle can run inside a host that autolinked this library and a host
 * that did not, and the difference is invisible until something calls it. This
 * is the check that turns "the map screen does nothing" into a branch you
 * wrote: hide the screen, or show why it is unavailable.
 *
 * It says nothing about permission, and nothing about whether the device has
 * location switched on — a linked module with a `denied` status is available.
 * Use `getPermissionStatus` and `isLocationEnabled` for those.
 */
export const isLocationAvailable = (): Promise<boolean> => isNativeModuleAvailable(MODULE)
