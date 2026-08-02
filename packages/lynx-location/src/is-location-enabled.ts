import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'

/**
 * Answers whether location services are switched on for the **device**.
 *
 * This is a different question from permission and the two are constantly
 * confused. A perfectly granted app on a device with location switched off gets
 * no fixes at all, and telling that user to check the app's permissions sends
 * them to a screen where everything already looks correct.
 *
 * The two together are what produce a useful message:
 *
 * ```ts
 * if (!(await isLocationEnabled())) return 'Turn on Location Services in Settings'
 * if ((await getPermissionStatus()) !== 'granted') return 'Allow this app to use your location'
 * ```
 *
 * It is a snapshot, not a subscription — the user can switch location off while
 * a watch is running, and that arrives as a `locationDisabled` update on the
 * watch rather than as a change here.
 */
export const isLocationEnabled = (): Promise<boolean> => callNativeAsync<boolean>(MODULE, 'isLocationEnabled')
