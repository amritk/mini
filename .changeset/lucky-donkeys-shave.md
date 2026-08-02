---
'@amritk/lynx-location': minor
---

Add `@amritk/lynx-location` — device location for Lynx.

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
