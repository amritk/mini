# @amritk/lynx-location

## 0.2.0

### Minor Changes

- 293234c: Add `@amritk/lynx-location` — device location for Lynx.

  Lynx ships no location module, Sparkling's built-ins stop at navigation,
  storage and media, and the one published community package
  (`@sigx/lynx-location`) calls `NativeModules` directly from its JavaScript half,
  which is background-thread only — so a main-thread `@amritk/mini-lynx` component
  importing it gets `undefined`. This is an Android module, an iOS module, and a
  promise-shaped facade over `@amritk/mini-lynx-native`, built from the shape
  `@amritk/lynx-notifications` established.

  `getPermissionStatus`, `requestPermission`, `getCurrentPosition`,
  `getLastKnownPosition`, `isLocationEnabled`, `isLocationAvailable` and
  `watchPosition`. `CLLocationManager` on iOS, `LocationManager` on Android — not
  the fused provider, so no Play Services dependency and no non-GMS devices
  excluded. Foreground only, deliberately: no `ACCESS_BACKGROUND_LOCATION` and no
  `Always` authorisation.

  Failures are values rather than rejections — `{ ok: true, position }` or
  `{ ok: false, error, message }` — because Lynx has no error convention for
  bridge callbacks and a missing permission is an ordinary UI branch.

  `@amritk/lynx-location/testing` ships the native contract as an executable fake.
  Nothing here has run on a device; see the package's `AGENTS.md` for what the
  three CI checks do and do not cover.

- 7c690ed: Add `reverseGeocode` to `@amritk/lynx-location` — coordinates to a postal
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

### Patch Changes

- 1b6c33d: Bring every package's shipped `AI.md` back in line with what that package
  actually publishes, and add `bun run check:ai-docs` so it cannot drift again.

  The files had gone stale in the way generated-and-committed docs always do —
  silently, and only for the audience that cannot file an issue about it.
  `@amritk/mini` never documented `watch`, `template`, the typed `matchRoute` /
  `buildPath` re-exports on `/router`, `Field` on `/forms`, or the `/vite` subpath
  at all; `@amritk/mini-lynx` was missing `computed` / `effectScope`,
  `fadeTransition`, `keepAboveKeyboard` and `HANDLER_PREFIX`;
  `@amritk/lynx-notifications` documented neither its `/testing` subpath nor the
  fake behind it. All four native packages exported `MODULE` and `EVENTS` with no
  mention of what they are for, and only `@amritk/lynx-dialogs` showed how to wire
  a fake into `installNativeBridge` — which is the one thing a consumer testing
  its own screens needs.

  Two accuracy fixes matter more than the additions. Every native package's
  _Status_ section claimed the Objective-C compiles against the real Lynx pod; the
  macOS CI job was disabled on cost, so it now compiles only when somebody runs
  `pod lib lint` by hand, and the docs say that. And `@amritk/lynx-dialogs` never
  carried a _Status_ section at all, so nothing in it told a reader that none of
  it has run on a device.

  `bun run check:ai-docs` reads each package's `exports` and fails on a runtime
  export, a published subpath, or (for a package shipping native sources) a
  _Status_ section its `AI.md` never mentions. It runs early in CI, before the
  build. Exports no consumer ever writes — the tree operations the JSX transform
  calls, and the like — are listed in `INTERNAL_EXPORTS` with the reason.

- Updated dependencies [e025ac7]
- Updated dependencies [5101aa7]
  - @amritk/mini-lynx-native@0.2.0
