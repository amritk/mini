# @amritk/lynx-notifications

## 0.2.0

### Minor Changes

- e025ac7: Add native modules for Lynx, starting with push notifications.

  Lynx ships no notifications module, and Sparkling's `sparkling-notifications` is
  a reserved npm name with no implementation behind it — so the official answer is
  still "write native code and send it into your Lynx code". These two packages
  are that, plus the piece it needs first.

  **`@amritk/mini-lynx-native`** is the wire. Lynx's `NativeModules` and
  `GlobalEventEmitter` are background-thread globals, while `@amritk/mini-lynx`
  renders on the main thread because the Element PAPI is a main-thread API — so a
  component reaching for a native module finds `undefined`, with nothing to read.
  The package carries calls one way and events the other: `callNative` and
  `callNativeAsync` for the two shapes a Lynx native method comes in,
  `isNativeModuleAvailable` for feature detection, and `onNativeEvent` for
  `sendGlobalEvent`. Calls made before the background half is installed are queued
  rather than lost, because the main-thread chunk usually runs first. The
  `/background` subpath is the half an app installs in its background chunk, in
  one line; `/testing` ships the fakes both halves run against.

  **`@amritk/lynx-notifications`** is the first module built on it: local and
  remote push, with an Android implementation (`NotificationManager`,
  `AlarmManager`, FCM) and an iOS one (`UNUserNotificationCenter`, APNs) declared
  to Lynx's autolinker through `lynx.lib.json`. The JavaScript surface is promises
  and subscriptions rather than signals, deliberately — a second edge onto the
  signal engine is how a consumer ends up with two reactive graphs that cannot see
  each other's writes.

  Both native halves are compiled in CI — Gradle against the real
  `org.lynxsdk.lynx:lynx` AAR for Android, `pod lib lint` against the real Lynx pod
  on a macOS runner for iOS — and `src/native-contract.test.ts` pins their method
  names, arities and event strings against the TypeScript, which is the one class
  of drift no compiler on either side can catch. `bun run check:android` runs the
  Android compile locally and skips with an explanation when there is no SDK.

  **None of that has run on a device.** Permission flows, `AlarmManager` under
  Doze, APNs registration and FCM delivery are unverified. The caveat is carried in
  the package's `README.md`, `AI.md` and `AGENTS.md`.

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

- 4423822: Backport the dangling-selector check from `@amritk/lynx-location`'s parity
  suite: `native-contract.test.ts` now asserts that every selector named in the
  Objective-C `methodLookup` table has a method implementing it.

  That is the one cross-language failure nothing else here could see. A selector
  string pointing at no method is not a build error on iOS — `pod lib lint`
  passes — and fails only when Lynx tries to dispatch through it, on a device, as
  a promise that never settles. All eleven of the package's selectors resolve
  today; the check is mutation-verified.

  No runtime change.

- Updated dependencies [e025ac7]
- Updated dependencies [5101aa7]
  - @amritk/mini-lynx-native@0.2.0
