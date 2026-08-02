import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'

/**
 * Opens this app's page in the system settings, and resolves with whether the
 * screen was shown.
 *
 * It lives here because it is the same mechanism — a URL handed to the system —
 * and because it is the missing half of every permission API in this
 * repository. `@amritk/lynx-location` and `@amritk/lynx-notifications` both
 * report a `denied` the user can only undo in settings, and both say so in
 * their docs; this is how an app actually takes them there.
 *
 * ```ts
 * if ((await getPermissionStatus()) === 'denied') {
 *   // A second prompt shows nothing. This is the only route back.
 *   await openSettings()
 * }
 * ```
 *
 * ## What it will not do
 *
 * Land on a *specific* setting. Android's `ACTION_APPLICATION_DETAILS_SETTINGS`
 * and iOS's `UIApplicationOpenSettingsURLString` both open the app's page and
 * nothing finer, and the deep links into individual toggles that circulate are
 * private URLs that fail App Review or break between releases. The user takes
 * one more tap; tell them which toggle to look for.
 *
 * It also does not come back. The app is backgrounded from here, and on iOS a
 * permission changed in settings **terminates the app** rather than returning
 * to it — so do not put unsaved state behind this call.
 */
export const openSettings = (): Promise<boolean> => callNativeAsync<boolean>(MODULE, 'openSettings')
