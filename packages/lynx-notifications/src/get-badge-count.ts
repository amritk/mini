import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'

/**
 * Reads the number currently on the app icon's badge.
 *
 * iOS owns this number and reports it back faithfully. Android has no
 * system-wide badge count — launchers show a dot, a count, or nothing at all,
 * entirely at their own discretion — so there the module reports the last value
 * this app set, which is the most useful answer available rather than a
 * measurement.
 */
export const getBadgeCount = (): Promise<number> => callNativeAsync<number>(MODULE, 'getBadgeCount')
