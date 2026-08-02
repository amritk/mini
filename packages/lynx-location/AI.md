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
  watchPosition,
} from '@amritk/lynx-location'

getPermissionStatus(): Promise<LocationPermissionStatus>  // 'undetermined' | 'denied' | 'granted' | 'restricted'
requestPermission(request?: { precise?: boolean }): Promise<LocationPermissionStatus>

getCurrentPosition(options?: PositionOptions): Promise<LocationResult>
getLastKnownPosition(): Promise<LocationFix | null>

isLocationEnabled(): Promise<boolean>    // the device-wide switch
isLocationAvailable(): Promise<boolean>  // whether the module is linked at all

watchPosition(listener: (update: WatchUpdate) => void, options?: WatchOptions): () => void

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

## Testing your own screens

```ts
import { createFakeLocation } from '@amritk/lynx-location/testing'
```

It is the executable statement of the JavaScript-to-native contract, and it
reproduces platform rules rather than smoothing them: a request after a refusal
returns the refusal, `locationDisabled` beats a granted permission, and a device
with no fix times out. Handles: `setPermissionStatus`, `setPermissionOutcome`,
`setLocationEnabled`, `setNextFix`, `setLastKnownPosition`, `emitPosition`,
`emitError`, `watches()`.

## Status

Pre-alpha. The Kotlin compiles in CI against the real Lynx AAR, the Objective-C
compiles against the real Lynx pod, and a parity suite pins both method surfaces
against the TypeScript — **but none of it has run on a device.** Permission
flows, provider behaviour and what a fix actually contains outdoors are
unverified. Do not present it as proven.
