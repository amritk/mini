---
'@amritk/mini-lynx-native': minor
'@amritk/lynx-notifications': minor
---

Add native modules for Lynx, starting with push notifications.

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
