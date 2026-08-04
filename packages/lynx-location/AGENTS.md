# AGENTS.md — @amritk/lynx-location

Contributor guide for AI agents editing **this package**. Repo-wide rules:
[`../../AGENTS.md`](../../AGENTS.md) and [`../../CLAUDE.md`](../../CLAUDE.md).
Consuming the package instead? See [`AI.md`](./AI.md).

Device location for Lynx: two native modules, and a promise-shaped facade over
`@amritk/mini-lynx-native`.

It is the second native module in this repository and it deliberately mirrors
the first. When you change something structural here, check
[`../lynx-notifications`](../lynx-notifications) for the same shape — and the
other way round.

## Commands

```bash
bun run --filter='@amritk/lynx-location' test
bun run --filter='@amritk/lynx-location' types:check
bun run --filter='@amritk/lynx-location' build

# Compiles the Kotlin against the real Lynx AAR and packages an AAR.
# Runs for every package with an Android half, this one included.
# Needs ANDROID_HOME with platforms/android-35; skips with a message without one.
bun run check:android
```

The iOS half is compiled by `pod lib lint` on a macOS CI runner — there is no
way to build it on Linux at all. See "What is verified, and what is not" below,
which is the most important thing on this page.

## Layout

```
src/
  index.ts              The `.` entry — every function, re-exported
  types.ts              The shapes that cross to native. One file, so Kotlin
                        and Objective-C have a single thing to agree with
  native-module.ts      MODULE and EVENTS — every string that crosses
  get-permission-status.ts / request-permission.ts
  get-current-position.ts / get-last-known-position.ts
  is-location-enabled.ts / is-location-available.ts
  watch-position.ts     The only subscription, and the only stateful facade
  reverse-geocode.ts    Coordinates to addresses. The only permission-free call
  native-contract.test.ts   Parses both native surfaces, compares to this one
  location.test.ts          The facade over the real bridge, against the fake
  testing/
    create-fake-location.ts   The native contract, executable
android-check/            A standalone Gradle project that COMPILES ../android
android/
  build.gradle.kts, src/main/AndroidManifest.xml
  src/main/java/dev/amritk/minilynx/location/
    MiniLynxLocationModule.kt        The @LynxMethod surface
    LocationEvents.kt                sendGlobalEvent fan-out; every crossing string
    LocationFixes.kt                 Provider choice and Location → JavaOnlyMap
    LocationResults.kt               The LocationResult envelope
    Geocoding.kt                     Geocoder, both API forms, Address → JavaOnlyMap
    GeocodeResults.kt                The GeocodeResult envelope
    SingleFixListener.kt             One fix, one answer, then torn down
    WatchListener.kt                 A running watch, publishing events
    LocationPermissionActivity.kt / LocationPermissionState.kt
    Options.kt                       Reading a ReadableMap without trusting it
ios/
  MiniLynxLocation.podspec
  src/MiniLynxLocationModule.{h,m}   The methodLookup surface
  src/MiniLynxLocationCenter.{h,m}   Every CLLocationManager, and the fan-out
lynx.lib.json           The autolink manifest
```

## Invariants — do not break these

- **`src/testing/create-fake-location.ts` IS the native contract.** Method
  names, arities and call forms are agreed in three places — the fake, the
  Kotlin and the Objective-C — and only the fake is executable here. Changing a
  method means changing all three in the same commit, and the fake is the one
  that will tell you if you got the TypeScript side wrong. Never "fix" a test by
  loosening the fake toward what the facade happens to do.
- **The fake reproduces platform behaviour rather than smoothing it.** A
  `requestPermission` after a denial returns the denial; a granted app on a
  device with location off still fails as `locationDisabled`; a device with no
  fix to give times out rather than resolving. Each of those is a real platform
  rule, and a fake that was friendlier than the device would hide exactly the
  bugs worth catching. Same bargain `@amritk/mini-lynx`'s fake engine makes.
- **No signals, and no `alien-signals` dependency.** A second edge onto the
  signal engine is how a consumer ends up with two reactive graphs that cannot
  see each other's writes — the reason `@amritk/mini-helpers` is barred from it
  too. The surface is promises and subscriptions; an app wires those into its
  own signal in one line. `scripts/consumer-e2e.test.ts` asserts the absent
  dependency.
- **A failure is a value, never a rejection.** Lynx has no error convention for
  bridge callbacks, so `LocationResult` and `WatchUpdate` are discriminated
  unions and every native failure path ends in an ordinary callback invocation.
  Making one of these throw would push every call site into a `try`/`catch` for
  something that happens on a perfectly normal first launch.
- **`watchPosition` holds events that arrive before its id does.** The watch id
  is assigned natively and comes back over the bridge, so for a few milliseconds
  the subscription cannot filter the stream it is listening to — and a device
  that already has a fix publishes inside that window. Held events keep the id
  they were published for, because a second watch publishes onto the same event
  name. Two tests pin this; losing the first fix of a watch is the bug that gets
  blamed on the hardware.
- **A watch that could not start still gets an id.** `startWatching` hands the
  id back before it reports any failure, which is what lets "permission denied"
  travel as an ordinary update on that watch instead of as a rejected call the
  facade would have to model separately.
- **Exactly one answer reaches a `getCurrentPosition` caller.** Three things
  race — a fix, a provider failure, and the timeout — and invoking a Lynx
  `Callback` twice is not recoverable on the other side. `SingleFixListener`
  decides with an atomic flag; `MiniLynxLocationCenter` decides by removing the
  pending entry before calling the completion. Any new answer path owes the same
  treatment.
- **A `CLLocationManager` must outlive the call that made it.** CoreLocation
  answers through a delegate, so a manager released at the end of the method
  that created it is a callback that never arrives — silently. This is why the
  Center is a singleton holding every manager, and why the permission manager is
  a property rather than a local.
- **`LocationManager`, not `FusedLocationProviderClient`.** The fused provider
  is better at this and lives in `com.google.android.gms:play-services-location`.
  Taking it would push Play Services into every host app that autolinks this
  library and lock out the devices without it. Do not "upgrade" to it.
- **Foreground only, and that is a decision.** No `ACCESS_BACKGROUND_LOCATION`,
  no `Always` authorisation, no foreground service. Each is a second prompt, a
  Play Store declaration or an App Review conversation, and none of them are
  things a library should quietly enrol its host app in.
- **CoreLocation's negatives become nulls.** `horizontalAccuracy`, `speed` and
  `course` are negative when unknown rather than absent. Passing -1 through
  would give JavaScript a heading of minus one degree, which looks plausible and
  is wrong. `payloadFor:` is the one place this conversion happens.
- **`reverseGeocode` checks no permission, on any of the three sides.** It never
  reads the device's own location, so an app refused location outright can still
  label a saved venue. Adding a check to make it look like every other method on
  those classes would push consumers into requesting a permission they have no
  use for. A test pins this; it is the kind of thing a tidy-up removes.
- **Coordinates are range-checked before either geocoder is asked.** Android's
  `Geocoder` throws `IllegalArgumentException` on out-of-range input and
  CoreLocation quietly answers with nothing, so neither platform can be left to
  report this for itself. The check is in three places — the fake, `Geocoding.isValid`
  and `CLLocationCoordinate2DIsValid` — and they have to stay the same check.
- **`notFound` is the only spelling of "no address there".** An empty
  `addresses` array is never a success. Two spellings of one outcome means a
  call site can handle half of it and look correct.
- **Throttling is `network`, not a code of its own.** Apple rate-limits
  `CLGeocoder` and reports it as a network error; Android reports nothing of the
  kind. A code only one platform can produce is a branch an app writes and never
  sees fire — the same rule that keeps `restricted` off the Android half.
- **Every `GeocodeAddress` field is written explicitly, blank-as-null.** Same
  bargain `LocationFixes.toPayload` makes: an absent key arrives as `undefined`
  and the type says `null`. Android additionally reports unknown components as
  empty strings about as often as null, and the iOS half already collapses the
  two — `Geocoding.putStringOrNull` is where that happens, and dropping it would
  give one platform a `city` of `""`.
- **`LocationListener`'s four methods are all implemented.** Three became
  default methods in API 30, but on every device below that they are still
  abstract — a class implementing only `onLocationChanged` throws
  `AbstractMethodError` there. The `@Suppress` on `onStatusChanged` is load
  bearing for `check:android`, which fails on warnings.

## What is verified, and what is not

Four things state this package's contract — the facade, the fake, the Kotlin and
the Objective-C — and they are checked at three different strengths. Know which
one you are relying on before trusting a green run.

| Check | Command | Strength |
| --- | --- | --- |
| Facade behaviour | `bun run test` | real code, fake platform |
| Cross-language signatures | `src/native-contract.test.ts` | parses Kotlin + Objective-C, compares to TypeScript |
| Kotlin compiles + packages | `bun run check:android` | real `org.lynxsdk.lynx:lynx` AAR, real Android SDK |
| Objective-C compiles | `pod lib lint` (CI, macOS) | real Lynx pod, real iOS SDK |

`native-contract.test.ts` is the cheapest of these and catches the failure a
compiler cannot on either side: a method renamed in one language, an argument
added in one, an event name that drifts, an error code only one platform can
report. It also checks something `pod lib lint` cannot — that every selector in
`methodLookup` names a method that exists, which on iOS is not a build error but
a dispatch failure on a device. **Mutation-check it if you change it** — a
parity test that cannot fail is worse than none, because it looks like coverage.

`check:android` is deliberately outside `bun run test`: it needs an SDK, pulls
from the network and takes minutes cold, and a check with those properties in
the default loop is one people learn to skip. It skips with an explanation
locally and is `--require-sdk` in CI.

**None of that is a device.** Still unverified, and worth checking on hardware
first:

- that `@LynxNativeModule` on a class extending `LynxContextModule` actually
  registers — it compiles, but whether Lynx's processor picks it up without the
  generated Spec its own template extends is untested;
- that `sendGlobalEvent(name, [payload])` arrives as a single first argument on
  the JavaScript listener, which is what `onNativeEvent` assumes;
- that a `null` written into a `JavaOnlyMap` arrives as `null` rather than
  `undefined`, which is what `LocationFix`'s nullable fields assume;
- every behaviour that depends on the OS: the permission dialogs and the
  precise/approximate choice, which provider actually answers, what a fix
  contains outdoors versus indoors, timeout behaviour with a cold radio, and
  whether a watch survives a backgrounding.

Reverse geocoding adds four of its own, all of which want a device and a real
backend before anyone trusts them:

- that `CNPostalAddressFormatter` and Android's `getAddressLine(0)` produce
  comparable strings for the same place. They are both the platform's own
  formatting, which is the whole argument for using them, and nothing here has
  put the two side by side;
- which fields each backend actually fills in, and how often. The types say
  every one is nullable; how much of that is theoretical is a question for a
  handful of real coordinates in a few countries;
- that `Geocoder`'s API 33 callback form and the blocking form below it fail the
  same way in practice, rather than only in the way their documentation implies;
- what Apple's unpublished rate limit actually is, and whether exceeding it
  really does arrive as `kCLErrorNetwork` rather than as something the error
  mapping sends to the wrong code.

This is the same shape of caveat `@amritk/mini-lynx` carries for its worklet
round-trip. Carry it the same way: state it, do not let a green suite imply more
than it proves, and narrow it only when something has actually checked.

Add a changeset for every change (`bunx changeset`).
