# AGENTS.md — @amritk/lynx-deep-linking

Contributor guide for AI agents editing **this package**. Repo-wide rules:
[`../../AGENTS.md`](../../AGENTS.md) and [`../../CLAUDE.md`](../../CLAUDE.md).
Consuming the package instead? See [`AI.md`](./AI.md).

Deep links for Lynx: two native modules, and a promise-shaped facade over
`@amritk/mini-lynx-native`.

It is the fourth native module in this repository and it deliberately mirrors
the first three. When you change something structural here, check
[`../lynx-notifications`](../lynx-notifications),
[`../lynx-location`](../lynx-location) and
[`../lynx-dialogs`](../lynx-dialogs) for the same shape — and the other way
round.

## Commands

```bash
bun run --filter='@amritk/lynx-deep-linking' test
bun run --filter='@amritk/lynx-deep-linking' types:check
bun run --filter='@amritk/lynx-deep-linking' build

# Compiles the Kotlin against the real Lynx AAR and packages an AAR.
# Runs for every package with an Android half, this one included.
# Needs ANDROID_HOME with platforms/android-35; skips with a message without one.
bun run check:android
```

The iOS half is not compiled anywhere automatic: the macOS CI job that ran
`pod lib lint` is commented out in `.github/workflows/ci.yml` because it cost 81
minutes a run, and there is no way to build it on Linux at all. Run it by hand
on a Mac when you touch `ios/`. See "What is verified, and what is not" below,
which is the most important thing on this page.

## Layout

```
src/
  index.ts              The `.` entry — every function, re-exported
  types.ts              The shapes that cross to native. One file, so Kotlin
                        and Objective-C have a single thing to agree with
  native-module.ts      MODULE and EVENTS — every string that crosses
  get-initial-url.ts    The cold-start URL, as a value
  on-deep-link.ts       The only subscription; flushes the held link
  open-url.ts / can-open-url.ts / open-settings.ts
  is-deep-linking-available.ts
  parse-url.ts / create-url.ts   Pure; no bridge, no platform
  native-contract.test.ts   Parses both native surfaces, compares to this one
  deep-linking.test.ts      The facade over the real bridge, against the fake
  url.test.ts               The two pure halves
  testing/
    create-fake-deep-linking.ts   The native contract, executable
android-check/            A standalone Gradle project that COMPILES ../android
android/
  build.gradle.kts, src/main/AndroidManifest.xml   provider + <queries>
  src/main/java/dev/amritk/minilynx/deeplinking/
    MiniLynxDeepLinkingModule.kt   The @LynxMethod surface
    DeepLinks.kt                   Where every inbound URL enters; the host API
    DeepLinkInitializer.kt         ContentProvider → lifecycle callback → cold start
    DeepLinkEvents.kt              sendGlobalEvent fan-out + held link; every crossing string
    SystemLinks.kt                 The outbound intents
    OpenResults.kt                 The OpenResult envelope
ios/
  MiniLynxDeepLinking.podspec
  src/MiniLynxDeepLinkingModule.{h,m}   The methodLookup surface
  src/MiniLynxDeepLinkingCenter.{h,m}   Launch capture, fan-out, UIApplication
lynx.lib.json           The autolink manifest
```

## Invariants — do not break these

- **`src/testing/create-fake-deep-linking.ts` IS the native contract.** Method
  names, arities and call forms are agreed in three places — the fake, the
  Kotlin and the Objective-C — and only the fake is executable here. Changing a
  method means changing all three in the same commit, and the fake is the one
  that will tell you if you got the TypeScript side wrong. Never "fix" a test by
  loosening the fake toward what the facade happens to do.
- **The fake reproduces platform behaviour rather than smoothing it.** A scheme
  the host app never declared fails as `noHandler` even though the "device"
  could obviously open it; a URL with no scheme fails as `invalidURL`; the held
  link is replayed exactly once. Each is a real platform rule, and a fake that
  was friendlier than the device would hide exactly the bugs worth catching.
  Same bargain `@amritk/mini-lynx`'s fake engine makes.
- **No signals, and no `alien-signals` dependency.** A second edge onto the
  signal engine is how a consumer ends up with two reactive graphs that cannot
  see each other's writes — the reason `@amritk/mini-helpers` is barred from it
  too. The surface is promises and subscriptions; an app wires those into its
  own signal in one line. `scripts/consumer-e2e.test.ts` asserts the absent
  dependency.
- **A failure is a value, never a rejection.** Lynx has no error convention for
  bridge callbacks, so `OpenResult` is a discriminated union and every native
  failure path ends in an ordinary callback invocation. Making one throw would
  push every call site into a `try`/`catch` for something a healthy device does.
- **The launch URL is a value; everything else is an event.** `getInitialURL`
  answers what started the process and never changes; `onDeepLink` never
  re-delivers it. Both native halves enforce this, each with its own mechanism —
  a consumed-marker on the Android `Intent`, a first-inbound-URL rule on iOS —
  because an app wired to both would otherwise navigate twice for one tap. Two
  tests pin the JavaScript side of it.
- **The held link is delivered once, to whoever asks first.** `flushPendingLink`
  is called by `onDeepLink` *after* it subscribes; reversing that order races
  the replay against the subscription and drops the one link the mechanism
  exists for. The same load-bearing ordering as
  `@amritk/lynx-notifications`'s cold-start response.
- **`parseURL` reports the first segment as the host, and must keep doing so.**
  `myapp://profile/42` is host `profile`, path `/42`. Making it "helpfully"
  report `/profile/42` would put this parser at odds with every other one on
  both platforms, including the ones an app's server and its email templates
  use. The surprise is the URL grammar's; documenting it is this package's job.
- **`parseURL` decodes the query and the fragment, never the path.** Decoding a
  path whole turns an encoded `%2F` into a separator and changes how many
  segments there are. `matchRoute` decodes per segment, which is the level that
  is safe.
- **The Android cold-start capture lives in the manifest.** `DeepLinkInitializer`
  is registered by the `<provider>` entry and by nothing else, so deleting it
  compiles, passes every JavaScript test, and makes `getInitialURL` answer null
  forever. `native-contract.test.ts` asserts the entry, the `${applicationId}`
  authority — a fixed one fails the *install* on a device that already has
  another app built with this library — and the `<queries>` block.
- **`+load`, not an initialiser, on iOS.** The launch URL is only readable from
  `UIApplicationDidFinishLaunchingNotification`, which fires before any Lynx
  view exists. `+load` runs at image load, before `UIApplicationMain`. Anything
  later cannot see it, because `launchOptions` is not readable after the fact.
- **Recents is not a new link.** Android re-delivers the original intent when
  the user returns through the recents screen, and `FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY`
  is the only way to tell. Without that check every return to the app re-opens
  the deep link it was last launched with.
- **No dependency in `android/build.gradle.kts` beyond `compileOnly` Lynx.**
  Everything here is platform API from API 1. A library that is autolinked into
  every host app and does nothing most of the time has no business adding to a
  host's dependency graph.

## What is verified, and what is not

Four things state this package's contract — the facade, the fake, the Kotlin and
the Objective-C — and they are checked at three different strengths. Know which
one you are relying on before trusting a green run.

| Check | Command | Strength |
| --- | --- | --- |
| Facade behaviour | `bun run test` | real code, fake platform |
| Cross-language signatures | `src/native-contract.test.ts` | parses Kotlin + Objective-C, compares to TypeScript |
| Kotlin compiles + packages | `bun run check:android` | real `org.lynxsdk.lynx:lynx` AAR, real Android SDK |
| Objective-C compiles | `pod lib lint` (manual, macOS — not in CI) | real Lynx pod, real iOS SDK |

`native-contract.test.ts` is the cheapest of these and catches the failure a
compiler cannot on either side: a method renamed in one language, an argument
added in one, an event name that drifts, a payload key only one platform
publishes. It also checks something `pod lib lint` cannot — that every selector
in `methodLookup` names a method that exists, which on iOS is not a build error
but a dispatch failure on a device. **Mutation-check it if you change it** — a
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
- **the whole cold-start path on both platforms.** The `ContentProvider` has to
  be created before the first activity, and `+load` has to run before the launch
  notification in a host that links statically. Both are documented behaviours
  of the platforms and neither is exercised by anything here;
- what a **scene-based** iOS app actually delivers, and whether the
  first-inbound-URL duplicate rule holds there rather than swallowing a real
  link;
- every behaviour that depends on the OS: `autoVerify` App Links, Universal Link
  association files, package visibility on a real Android 11+ device, and
  whether `openSettings` lands where it should on a manufacturer skin.

This is the same shape of caveat `@amritk/mini-lynx` carries for its worklet
round-trip. Carry it the same way: state it, do not let a green suite imply more
than it proves, and narrow it only when something has actually checked.

Add a changeset for every change (`bunx changeset`).
