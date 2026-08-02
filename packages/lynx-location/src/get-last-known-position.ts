import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { LocationFix } from './types'

/**
 * Reads the fix the system already has, without starting a provider. Resolves
 * `null` when there is not one.
 *
 * This is the cheap one. It powers nothing up, returns in milliseconds, and is
 * exactly what a screen wants for its first paint — show the last known
 * position immediately, then replace it when `getCurrentPosition` comes back.
 * The alternative, an empty map for three seconds, is worse in every case.
 *
 * ## The catch is the timestamp
 *
 * There is no bound on how old this is. It can be days stale and from another
 * city, because it is whatever the device last computed for anybody. Check
 * `timestamp` before trusting it for anything that depends on the user being
 * *there* — and prefer `getCurrentPosition` with `maximumAge` when you want
 * "recent or nothing", which is that check expressed as a request.
 *
 * Resolves `null` rather than an error when permission is missing: no fix is no
 * fix, and the caller was already handling that branch.
 */
export const getLastKnownPosition = (): Promise<LocationFix | null> =>
  callNativeAsync<LocationFix | null>(MODULE, 'getLastKnownPosition')
