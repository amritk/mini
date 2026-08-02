# @amritk/lynx-location

**Device location for Lynx.** An Android native module, an iOS native module,
and a promise-shaped facade that reaches them from a main-thread
[`@amritk/mini-lynx`](../mini-lynx) tree.

```ts
import { getCurrentPosition, getPermissionStatus, requestPermission } from '@amritk/lynx-location'

if ((await getPermissionStatus()) === 'undetermined') await requestPermission()

const result = await getCurrentPosition({ accuracy: 'high', maximumAge: 30_000 })
if (result.ok) console.log(result.position.latitude, result.position.longitude)
```

## Why this exists

Lynx ships no location module. Neither does
[Sparkling](https://github.com/tiktok/Sparkling) — its built-ins are navigation,
storage and media, and anything else is a Sparkling Method you write yourself.
There is one published community package,
[`@sigx/lynx-location`](https://www.npmjs.com/package/@sigx/lynx-location), and
its JavaScript half calls `NativeModules` directly, which is background-thread
only — so a `mini-lynx` component importing it gets `undefined` with no error to
read. Lynx's official answer is "write native code and send it into your Lynx
code", so that is what this is.

## Install

```sh
bun add @amritk/lynx-location
```

`@amritk/mini-lynx-native` comes with it — it is the wire every call travels.

## JavaScript setup

One line, in your **background** chunk:

```ts
import { installNativeBridge } from '@amritk/mini-lynx-native/background'

installNativeBridge()
```

Without it every call queues forever and nothing says why. `NativeModules` is a
background-thread global and `@amritk/mini-lynx` renders on the main thread, so
this package cannot reach the platform without a chunk it does not own
installing the other half. See
[`@amritk/mini-lynx-native`](../mini-lynx-native) for the reasoning.

Then, anywhere on the main thread:

```tsx
import { onCleanup, signal } from '@amritk/mini-lynx'
import { type LocationFix, getCurrentPosition, watchPosition } from '@amritk/lynx-location'

const Map = () => {
  const position = signal<LocationFix | null>(null)

  getCurrentPosition({ maximumAge: 60_000 }).then((result) => {
    if (result.ok) position(result.position)
  })

  onCleanup(
    watchPosition((update) => {
      if (update.ok) position(update.position)
    }, { distanceFilter: 10 }),
  )

  return <text>{() => (position() ? `${position()?.latitude}, ${position()?.longitude}` : 'locating…')}</text>
}
```

## Host-app setup

`lynx.lib.json` declares both native sources, so Lynx's autolinking picks them
up. What autolinking cannot supply is the strings and entitlements that belong
to your app.

### Android

The two permissions are declared in this library's manifest and reach your app
through manifest merging — you do not add them yourself:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

**Know that this happens.** They appear in your merged manifest, on your Play
Store listing, and in your data safety form. That is the cost of shipping a
location library, and there is no version of it that avoids the declaration.

`ACCESS_BACKGROUND_LOCATION` is deliberately **not** declared. It is a second
prompt and a Play Store review conversation, and nothing here can use it.

If your build does not run Lynx's annotation processor, register the module by
hand:

```kotlin
LynxEnv.inst().registerModule("MiniLynxLocationModule", MiniLynxLocationModule::class.java)
```

### iOS

Add the usage description to your `Info.plist`. **This one is not optional** —
iOS terminates the app the moment it asks for location without it, and the crash
log does say why, but only if you look:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Shows nearby results and centres the map on you.</string>
```

Write a real sentence there. It is the text in the system prompt, and it is the
whole of what the user has to decide on.

Register the module where you build your Lynx config:

```objc
#import <MiniLynxLocation/MiniLynxLocationModule.h>

[config registerModule:MiniLynxLocationModule.class];
```

There is nothing to forward from your app delegate — unlike notifications,
CoreLocation answers the object that asked.

## API

```ts
getPermissionStatus(): Promise<LocationPermissionStatus>  // 'undetermined' | 'denied' | 'granted' | 'restricted'
requestPermission(request?: LocationPermissionRequest): Promise<LocationPermissionStatus>

getCurrentPosition(options?: PositionOptions): Promise<LocationResult>
getLastKnownPosition(): Promise<LocationFix | null>

isLocationEnabled(): Promise<boolean>    // device-wide switch, NOT permission
isLocationAvailable(): Promise<boolean>  // is the native module linked at all

watchPosition(listener: (update: WatchUpdate) => void, options?: WatchOptions): () => void
```

`LocationResult` and `WatchUpdate` are discriminated unions —
`{ ok: true, position }` or `{ ok: false, error, message }` — rather than
rejections. Lynx has no error convention for bridge callbacks, so a failure has
to travel as a value anyway, and "the user has not granted location" is an
ordinary branch in a UI rather than an exceptional condition.

## The things that actually bite

- **Permission and the device switch are different questions.** A perfectly
  granted app on a device with Location Services off gets nothing, and sending
  that user to your app's permission screen shows them a setting that already
  looks correct. Check `isLocationEnabled()` first; it is why it exists.
- **You get one prompt, ever.** iOS shows it once per install; Android stops
  after two dismissals. A second request displays nothing and reports the
  standing answer. Spend it when the user has just asked for something that
  needs their location — not on first launch.
- **`denied` is final, `restricted` is worse.** The route back from `denied` is
  the system settings app. There is no route back from `restricted`: it is off
  by parental controls or an MDM profile, and offering a settings link is
  offering a dead end.
- **`getCurrentPosition` can take seconds.** A cold radio indoors at `high`
  accuracy is the worst case and it is not rare, which is why `timeout` defaults
  to something finite. Set `maximumAge` when an approximate answer will do — it
  turns a three-second wait into an immediate one.
- **A watch holds a provider open.** That is a battery cost the user can see in
  their settings app. Hand the returned function to `onCleanup`.
- **`heading` is course over ground, not compass heading.** It is derived from
  consecutive fixes, so a stationary device reports null no matter which way it
  is pointing.
- **Foreground only.** Both platforms stop delivering to a backgrounded app.
  That is the platform working as designed, not a gap to work around.
- **`WatchOptions.interval` is Android-only.** CoreLocation has no equivalent
  and decides its own cadence. Pace with `distanceFilter`, which both honour.

## Testing

`@amritk/lynx-location/testing` ships the native module's contract as an
in-memory fake, which is what this package's own suite runs against:

```ts
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
import { createFakeContexts, createFakeEmitter } from '@amritk/mini-lynx-native/testing'
import { MODULE } from '@amritk/lynx-location'
import { createFakeLocation } from '@amritk/lynx-location/testing'

const contexts = createFakeContexts()
const emitter = createFakeEmitter()
const location = createFakeLocation(emitter)

setPeerContext(contexts.mainThread)
installNativeBridge({ peer: contexts.background, emitter, modules: { [MODULE]: location.module } })

location.setPermissionStatus('granted')
location.setNextFix({ latitude: 51.5072, longitude: -0.1276, accuracy: 12, /* … */ })
```

It reproduces the platforms rather than smoothing them over: a request after a
refusal returns the refusal, a device with location switched off fails as
`locationDisabled` even when permission is granted, and a device with no fix to
give times out. A fake friendlier than a device would hide the bugs worth
catching.

## Status, and what is actually verified

**Pre-alpha, and nothing here has run on a device.** Three checks of decreasing
reach stand behind it, and it is worth knowing which one a green run came from:

| Check | Command | Strength |
| --- | --- | --- |
| Facade behaviour | `bun run test` | real code, fake platform |
| Cross-language signatures | `src/native-contract.test.ts` | parses Kotlin + Objective-C, compares to TypeScript |
| Kotlin compiles + packages | `bun run check:android` | real Lynx AAR, real Android SDK |
| Objective-C compiles | `pod lib lint` (CI, macOS) | real Lynx pod, real iOS SDK |

None of that is a device. Permission flows, provider selection, what a fix
actually contains outdoors, whether a watch survives a backgrounding, and
whether Lynx's annotation processor registers the module without the generated
Spec its own template extends are all unverified. See
[`AGENTS.md`](./AGENTS.md).

## Licence

MIT
