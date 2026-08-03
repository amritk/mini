---
'@amritk/lynx-location': minor
---

Add `reverseGeocode` to `@amritk/lynx-location` — coordinates to a postal
address, on both platforms.

`CLGeocoder` on iOS, `android.location.Geocoder` on Android. The Android half
uses the API 33 callback form where it exists and the blocking form on an
executor below that, because this library supports devices well under 33 and a
network round trip on the calling thread is an ANR waiting to happen.

**It needs no permission and never prompts.** Reverse geocoding reads no device
location — it geocodes the coordinates it is handed — so an app that has been
refused location outright can still label a saved venue or a map centre. A
`LocationFix` satisfies the new `Coordinates` type, so pairing it with
`getCurrentPosition` needs no mapping step.

`GeocodeResult` is a discriminated union like the rest of the package:
`{ ok: true, addresses }` or `{ ok: false, error, message }`, where `error` is
`invalidCoordinates`, `notFound`, `network` or `unavailable`. Being throttled is
`network` rather than a code of its own — Apple rate-limits `CLGeocoder` and
reports it that way, and Android has no equivalent to report. `notFound` is the
only spelling of "there is no address there"; an empty `addresses` is never a
success.

Every `GeocodeAddress` field is nullable, and `formattedAddress` is built by the
OS — `getAddressLine(0)` on Android, `CNPostalAddressFormatter` on iOS — so it
places each country's postcode where that country places it. `isoCountryCode` is
the only field stable across locales.

The iOS half now links `Contacts`, for `CNPostalAddressFormatter` alone. It
reaches no contact store and needs no permission.

`createFakeLocation` gains `setNextAddresses`, `setGeocoderPresent`,
`setNetworkAvailable` and `geocodes()`. Nothing here has run on a device; the
package's `AGENTS.md` lists what reverse geocoding specifically leaves unproven.
