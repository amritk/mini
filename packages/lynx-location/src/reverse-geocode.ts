import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { Coordinates, GeocodeResult, ReverseGeocodeOptions } from './types'

/**
 * Turns coordinates into a postal address, or into why there was not one.
 *
 * The result is a discriminated union rather than a throw — see `GeocodeResult`
 * for why — so the shape of every call site is the same: check `ok`, then read
 * `addresses` or branch on `error`.
 *
 * ## No permission is involved, and that is the point
 *
 * This does not read the device's location, so it does not need permission to
 * do so and will never prompt. It geocodes whatever coordinates it is handed,
 * which means an app can label a venue, a saved address or a map centre without
 * ever asking the user for anything.
 *
 * Pairing it with {@link getCurrentPosition} is the case that *does* need
 * permission, and the permission belongs to that call rather than this one:
 *
 * ```ts
 * const result = await getCurrentPosition()
 * if (result.ok) await reverseGeocode(result.position)
 * ```
 *
 * A `LocationFix` satisfies `Coordinates`, so it goes straight through.
 *
 * ## It is a network call, and Apple counts them
 *
 * Both platforms answer from a remote service, so this is as slow and as
 * failable as any other request — `network` is a normal outcome on a train.
 *
 * Apple additionally rate-limits `CLGeocoder` per app and the limit is not
 * published. Their own guidance is at most one request per user action, and an
 * app that geocodes every row of a list as it scrolls will start getting
 * network errors for reasons that have nothing to do with the network. Geocode
 * on demand, cache what comes back, and key the cache on rounded coordinates
 * rather than on the address.
 *
 * There is deliberately no `timeout` option here, unlike `getCurrentPosition`.
 * A provider with no fix to give genuinely never answers, which is why that call
 * needs one; a network request always ends, and adding a second clock over the
 * top would only race the platform's own.
 *
 * @example
 * ```ts
 * const label = signal('')
 *
 * const describe = async (at: Coordinates) => {
 *   const result = await reverseGeocode(at, { locale: 'en-CA' })
 *   if (!result.ok) return
 *   const [address] = result.addresses
 *   label(address?.city ?? address?.formattedAddress ?? '')
 * }
 * ```
 */
export const reverseGeocode = (
  coordinates: Coordinates,
  options: ReverseGeocodeOptions = {},
): Promise<GeocodeResult> => {
  // Flattened into one bag rather than sent as two arguments, because both
  // native halves already read a single map — `Options.read` on Kotlin, an
  // `NSDictionary` on iOS — and keeping the wire to one map means a new option
  // later is a key rather than a signature change in three languages.
  const request = { ...coordinates, ...options }
  return callNativeAsync<GeocodeResult>(MODULE, 'reverseGeocode', request)
}
