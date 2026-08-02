import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { LocationPermissionRequest, LocationPermissionStatus } from './types'

/**
 * Prompts for permission to use location, and resolves with what the user
 * decided.
 *
 * ## You get one prompt, ever
 *
 * This is the part worth designing around rather than discovering. iOS shows
 * the `WhenInUse` prompt **once per install**; a second request resolves with
 * the existing answer and displays nothing. Android stops showing the dialog
 * after two dismissals and reports the refusal straight back. So the prompt is
 * a one-shot resource: spend it at the moment the user has just asked for
 * something that needs their location, not on first launch.
 *
 * A `denied` result is final as far as this API is concerned. The only way back
 * is the system settings app, which is why the honest response to `denied` is
 * an explanation and a link, not a retry. `restricted` does not even have that
 * route — location is off for this app by policy, and no amount of asking will
 * change it.
 *
 * ## What this does not ask for
 *
 * **Background location.** This is `WhenInUse` on iOS and foreground-only on
 * Android, deliberately: `Always` authorisation and `ACCESS_BACKGROUND_LOCATION`
 * are a separate second prompt, a separate Play Store declaration, and an App
 * Review conversation about why a library asked for them. An app that needs
 * geofencing or background tracking wants its own native module for it, not a
 * flag on this one.
 *
 * @example
 * ```ts
 * const status = await requestPermission({ precise: true })
 * if (status !== 'granted') explainWhyLocationMatters()
 * ```
 */
export const requestPermission = (request: LocationPermissionRequest = {}): Promise<LocationPermissionStatus> =>
  callNativeAsync<LocationPermissionStatus>(MODULE, 'requestPermission', request)
