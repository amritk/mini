# AI.md — @amritk/lynx-location

For an LLM consuming this package. Editing the repo instead? See
[`AGENTS.md`](./AGENTS.md).

## Mental model

A native module on each platform, plus a promise-shaped facade that reaches it.
`CLLocationManager` on iOS; `LocationManager` on Android — **not** the fused
provider, so no Play Services dependency.

Everything is a promise, because `NativeModules` lives in Lynx's background
context and a `@amritk/mini-lynx` tree renders on the main thread. There is no
synchronous read of anything here.

## Setup: one line you will forget

```ts
// background chunk — without this every call queues forever and nothing says why
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
installNativeBridge()
```

The native side links itself through `lynx.lib.json`. The iOS usage description
does not — `NSLocationWhenInUseUsageDescription` in the host app's `Info.plist`,
without which iOS terminates the app the first time it asks. See the README.

## The surface, in full

```ts
import {
  getCurrentPosition,
  getLastKnownPosition,
  getPermissionStatus,
  isLocationAvailable,
  isLocationEnabled,
  requestPermission,
  reverseGeocode,
  watchPosition,
} from '@amritk/lynx-location'

getPermissionStatus(): Promise<LocationPermissionStatus>  // 'undetermined' | 'denied' | 'granted' | 'restricted'
requestPermission(request?: { precise?: boolean }): Promise<LocationPermissionStatus>

getCurrentPosition(options?: PositionOptions): Promise<LocationResult>
getLastKnownPosition(): Promise<LocationFix | null>

isLocationEnabled(): Promise<boolean>    // the device-wide switch
isLocationAvailable(): Promise<boolean>  // whether the module is linked at all

watchPosition(listener: (update: WatchUpdate) => void, options?: WatchOptions): () => void

// Needs NO permission: it geocodes the coordinates you hand it and never reads
// the device's own location.
reverseGeocode(coordinates: Coordinates, options?: ReverseGeocodeOptions): Promise<GeocodeResult>

type PositionOptions = { accuracy?: 'high' | 'balanced' | 'low'; timeout?: number; maximumAge?: number }
type WatchOptions = { accuracy?: 'high' | 'balanced' | 'low'; distanceFilter?: number; interval?: number }

type LocationFix = {
  latitude: number
  longitude: number
  accuracy: number | null      // metres, 68% confidence
  altitude: number | null
  altitudeAccuracy: number | null
  speed: number | null         // m/s
  heading: number | null       // degrees from true north, course over ground
  timestamp: number            // epoch ms
}

type LocationResult =
  | { ok: true; position: LocationFix }
  | { ok: false; error: 'permissionDenied' | 'locationDisabled' | 'timeout' | 'unavailable'; message: string }

type WatchUpdate = LocationResult  // same two shapes

type Coordinates = { latitude: number; longitude: number }  // a LocationFix satisfies this
type ReverseGeocodeOptions = { locale?: string; maxResults?: number }

// Every field is nullable, and most are usually null.
type GeocodeAddress = {
  formattedAddress: string | null  // built by the OS — the field to show a user
  name: string | null
  streetNumber: string | null
  street: string | null
  district: string | null
  city: string | null
  subregion: string | null
  region: string | null
  postalCode: string | null
  country: string | null           // display string, changes with locale
  isoCountryCode: string | null    // stable across locales — the one to store
}

type GeocodeResult =
  | { ok: true; addresses: GeocodeAddress[] }  // never empty
  | { ok: false; error: 'invalidCoordinates' | 'notFound' | 'network' | 'unavailable'; message: string }
```

Pair it with a fix, no mapping step needed:

```ts
const position = await getCurrentPosition()
if (position.ok) {
  const where = await reverseGeocode(position.position, { locale: 'en-CA' })
  if (where.ok) label(where.addresses[0]?.city ?? '')
}
```

## Results are unions, not rejections

```ts
const result = await getCurrentPosition()
if (result.ok) use(result.position)
else if (result.error === 'locationDisabled') promptToEnableLocation()
```

`callNativeAsync` rejects only when the call could not be *made* (module not
linked, method missing). Everything else — no permission, no fix, timeout —
comes back as `{ ok: false }`. Do not wrap these in `try`/`catch` and expect to
catch a denial.

## Wiring it into signals

There are no signals in this package, on purpose: a second edge onto
`alien-signals` gives a consumer two reactive graphs that cannot see each
other's writes. Wiring is one line.

```tsx
import { onCleanup, signal } from '@amritk/mini-lynx'

const position = signal<LocationFix | null>(null)
getLastKnownPosition().then(position)          // instant first paint
onCleanup(watchPosition((u) => { if (u.ok) position(u.position) }, { distanceFilter: 10 }))
```

## Getting this wrong

- **Confusing permission with the device switch.** `getPermissionStatus()` is
  the app's grant; `isLocationEnabled()` is whether Location Services are on at
  all. A granted app on a device with location off gets nothing. Check both
  before telling the user what is wrong.
- **Prompting on launch.** One prompt per install on iOS, two dismissals on
  Android, and then it shows nothing forever. Ask when the user has just done
  something that needs it.
- **Treating `restricted` as `denied`.** `denied` is fixable in settings.
  `restricted` is an MDM or parental-controls block the user cannot lift, so a
  settings link is a dead end.
- **Never stopping a watch.** The returned function is not optional — a running
  watch holds a location provider open. Use `onCleanup`.
- **Reading `heading` as a compass.** It is course over ground; a stationary
  device reports null.
- **Expecting background updates.** Foreground only, both platforms, by design.
- **Relying on `WatchOptions.interval`.** Android honours it, iOS has no
  equivalent. Pace with `distanceFilter`.
- **Assuming `accuracy` is filled in.** It is `number | null`; treat null as
  "do not trust this fix".
- **Requesting permission before a `reverseGeocode`.** It does not need one and
  will not prompt. Asking first spends the one-shot dialog on nothing.
- **Geocoding in a list render.** Apple rate-limits `CLGeocoder` per app and
  answers with a `network` error once you pass it. One request per user action,
  and cache what comes back.
- **Building an address string from the parts.** Use `formattedAddress` — the OS
  already knows where that country puts the postcode.
- **Storing `country`.** It is a display string that changes with the device's
  language. `isoCountryCode` is the stable one.

## Testing your own screens

```ts
import { MODULE } from '@amritk/lynx-location'
import { createFakeLocation } from '@amritk/lynx-location/testing'

const location = createFakeLocation()
installNativeBridge({ peer, emitter, modules: { [MODULE]: location.module } })
```

It is the executable statement of the JavaScript-to-native contract, and it
reproduces platform rules rather than smoothing them: a request after a refusal
returns the refusal, `locationDisabled` beats a granted permission, and a device
with no fix times out. Handles: `setPermissionStatus`, `setPermissionOutcome`,
`setLocationEnabled`, `setNextFix`, `setLastKnownPosition`, `emitPosition`,
`emitError`, `watches()`.

`MODULE` is the key `NativeModules` exposes the native module under, and the one
the fake registers against. `EVENTS` names the global events the native side
publishes — `EVENTS.position` and `EVENTS.error`, both carrying the `watchId`
that `watchPosition` filters on, because one native module serves every watch in
the app. You need either only when wiring or asserting on the emitter yourself.

## Status

Pre-alpha. The Kotlin compiles in CI against the real Lynx AAR, and a parity
suite pins both native method surfaces against the TypeScript. The Objective-C
compiles only when somebody runs `pod lib lint` on a Mac by hand — the macOS CI
job was disabled on cost — and **none of it has run on a device.** Permission
flows, provider behaviour and what a fix actually contains outdoors are
unverified. Do not present it as proven.
