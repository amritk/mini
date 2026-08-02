# AGENTS.md — @amritk/mini-lynx-notifications

Contributor guide for AI agents editing **this package**. Repo-wide rules:
[`../../AGENTS.md`](../../AGENTS.md) and [`../../CLAUDE.md`](../../CLAUDE.md).
Consuming the package instead? See [`AI.md`](./AI.md).

Local and remote push notifications for Lynx: two native modules, and a
promise-shaped facade over `@amritk/mini-lynx-native`.

## Commands

```bash
bun run --filter='@amritk/mini-lynx-notifications' test
bun run --filter='@amritk/mini-lynx-notifications' types:check
bun run --filter='@amritk/mini-lynx-notifications' build

# Compiles the Kotlin against the real Lynx AAR and packages an AAR.
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
  get-device-token.ts / on-device-token.ts
  schedule-notification.ts / cancel-notification.ts / cancel-all-notifications.ts
  get-scheduled-notifications.ts
  on-notification-received.ts / on-notification-response.ts
  get-badge-count.ts / set-badge-count.ts
  create-notification-channel.ts
  is-notifications-available.ts
  native-contract.test.ts   Parses both native surfaces, compares to this one
  testing/
    create-fake-notifications.ts   The native contract, executable
android-check/            A standalone Gradle project that COMPILES ../android.
                          Outside android/ so the shipped directory stays clean
                          and Gradle's output never lands in the npm tarball
android/
  build.gradle.kts, src/main/AndroidManifest.xml
  src/main/java/dev/amritk/minilynx/notifications/
    MiniLynxNotificationsModule.kt   The @LynxMethod surface
    NotificationEvents.kt            sendGlobalEvent fan-out + cold-start buffer
    NotificationPresenter.kt         Channels, posting, tap intents
    NotificationScheduler.kt         AlarmManager arming and re-arming
    NotificationStore.kt             Scheduled records and badge, across process death
    NotificationPublisher.kt         Alarm → notification
    NotificationTapReceiver.kt       Tap → event + bring app forward
    NotificationBootReceiver.kt      Re-arm after restart
    NotificationPermissionActivity.kt / NotificationPermissionState.kt
    MiniLynxFirebaseMessagingService.kt / FirebaseTokens.kt
    Json.kt                          ReadableMap ⇄ org.json
ios/
  MiniLynxNotifications.podspec
  src/MiniLynxNotificationsModule.{h,m}   The methodLookup surface
  src/MiniLynxNotificationsCenter.{h,m}   Delegate, APNs, fan-out, cold-start buffer
lynx.lib.json           The autolink manifest
```

## Invariants — do not break these

- **`src/testing/create-fake-notifications.ts` IS the native contract.** Method
  names, arities and call forms are agreed in three places — the fake, the
  Kotlin and the Objective-C — and only the fake is executable here. Changing a
  method means changing all three in the same commit, and the fake is the one
  that will tell you if you got the TypeScript side wrong. Never "fix" a test by
  loosening the fake toward what the facade happens to do.
- **The fake reproduces platform behaviour rather than smoothing it.** A
  `requestPermission` after a denial returns the denial; creating an existing
  channel updates only its name and description; a reused id replaces rather
  than appends. Each of those is a real platform rule, and a fake that was
  friendlier than the device would hide exactly the bugs worth catching. Same
  bargain `@amritk/mini-lynx`'s fake engine makes.
- **No signals, and no `alien-signals` dependency.** A second edge onto the
  signal engine is how a consumer ends up with two reactive graphs that cannot
  see each other's writes — the reason `@amritk/mini-helpers` is barred from it
  too. The surface is promises and subscriptions; an app wires those into its
  own signal in one line. `scripts/consumer-e2e.test.ts` asserts the absent
  dependency.
- **The cold-start replay is asked for, not timed.** Native code cannot see when
  a bundle has finished subscribing, so `onNotificationResponse` subscribes and
  *then* calls `flushPendingResponse`. That order is load-bearing — reversing it
  races the replay against the subscription and drops the one event the whole
  mechanism exists for. The held response is delivered once; two tests pin it.
- **The iOS delegate chains rather than seizes.** There is one
  `UNUserNotificationCenter` delegate slot per process, so whoever assigns last
  wins and everyone else is silently gone. `MiniLynxNotificationsCenter` keeps
  the previous delegate and forwards to it — the same bargain
  `@amritk/mini-lynx` makes with `runWorklet`, because a host app may already be
  handling notifications of its own.
- **A foreground notification presents nothing.** `willPresentNotification`
  answers `UNNotificationPresentationOptionNone` on purpose: a system banner over
  the screen the user is actively using is worse than an in-app treatment, and
  `onNotificationReceived` is where that belongs. This is a product decision, not
  an oversight — do not "fix" it.
- **Android scheduling is inexact on purpose.** Exact alarms need
  `SCHEDULE_EXACT_ALARM`, which Google Play restricts to alarm clocks and
  calendars. A notifications library has no business making every host app
  justify that. Do not switch to `setExactAndAllowWhileIdle`.
- **Firebase is `compileOnly`, and the code that touches it catches
  `Throwable`.** An absent optional dependency arrives as `NoClassDefFoundError`,
  which is an `Error` and not an `Exception`, so a `catch (e: Exception)` would
  not stop it. `FirebaseTokens` is the only place this is allowed.
- **`NotificationStore` exists because Android has nothing to query.**
  `AlarmManager` holds a `PendingIntent`, not a readable payload, and the
  launcher badge is not a system concept. Both answers are "what this app last
  said". iOS answers both from the system and keeps no store.

## What is verified, and what is not

Four things state this package's contract — the facade, the fake, the Kotlin and
the Objective-C — and they are checked at three different strengths. Know which
one you are relying on before trusting a green run.

| Check | Command | Strength |
| --- | --- | --- |
| Facade behaviour | `bun run test` | real code, fake platform |
| Cross-language signatures | `src/native-contract.test.ts` | parses Kotlin + Objective-C, compares to TypeScript |
| Kotlin compiles + packages | `bun run check:android` | real `com.lynx:lynx` AAR, real Android SDK |
| Objective-C compiles | `pod lib lint` (CI, macOS) | real Lynx pod, real iOS SDK |

`native-contract.test.ts` is the cheapest of these and catches the failure a
compiler cannot on either side: a method renamed in one language, an argument
added in one, an event name that drifts. All three of those compile fine and
fail at the bridge, at runtime, on a device. **Mutation-check it if you change
it** — a parity test that cannot fail is worse than none, because it looks like
coverage.

`check:android` is deliberately outside `bun run test`: it needs an SDK, pulls
from the network and takes minutes cold, and a check with those properties in
the default loop is one people learn to skip. It skips with an explanation
locally and is `--require-sdk` in CI.

**None of this is a device.** Still unverified, and worth checking on hardware
first:

- that `@LynxNativeModule` on a class extending `LynxContextModule` actually
  registers — it compiles, but whether Lynx's processor picks it up without the
  generated Spec its own template extends is untested;
- that `sendGlobalEvent(name, [payload])` arrives as a single first argument on
  the JavaScript listener, which is what `onNativeEvent` assumes;
- every behaviour that depends on the OS: permission flows, `AlarmManager` under
  Doze, APNs registration, FCM delivery.

This is the same shape of caveat `@amritk/mini-lynx` carries for its worklet
round-trip. Carry it the same way: state it, do not let a green suite imply more
than it proves, and narrow it only when something has actually checked.

Add a changeset for every change (`bunx changeset`).
