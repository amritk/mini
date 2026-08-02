# @amritk/mini-lynx-notifications

Local and remote push notifications for Lynx — an Android module, an iOS module,
and a promise-shaped facade that reaches them from the main thread.

- **iOS** — `UNUserNotificationCenter` for scheduling and delivery, APNs for
  remote push.
- **Android** — `NotificationManager` + `AlarmManager` for scheduling, Firebase
  Cloud Messaging for remote push.

Transport-agnostic on the server side: forward the device token to your backend
and send through APNs and FCM directly, or through anything that fronts them.

## Why this exists

Lynx ships no notifications module. Sparkling's `sparkling-notifications` is a
reserved npm name with no implementation behind it (`0.0.1`, *"implementation
follows"*). The official answer in
[lynx-family/lynx#67](https://github.com/lynx-family/lynx/discussions/67) is
still "write native code and send it into your Lynx code".

## Install

```sh
bun add @amritk/mini-lynx-notifications
```

`@amritk/mini-lynx-native` comes with it — it is the thread hop this package's
calls travel over, because `NativeModules` is background-thread-only and a
`@amritk/mini-lynx` tree renders on the main thread.

## JavaScript setup

One line in the background chunk, then use it from anywhere:

```ts
// background chunk
import { installNativeBridge } from '@amritk/mini-lynx-native/background'

installNativeBridge()
```

```tsx
// main-thread chunk
import {
  createNotificationChannel,
  getPermissionStatus,
  onNotificationResponse,
  requestPermission,
  scheduleNotification,
} from '@amritk/mini-lynx-notifications'

// At the app root, during the first render — a cold-start tap is replayed to
// whoever subscribes first, and only once.
onCleanup(
  onNotificationResponse(({ notification }) => {
    const screen = notification.data['screen']
    if (typeof screen === 'string') router.navigate(screen)
  }),
)

// Android needs a channel or notifications are dropped in silence. No-op on iOS.
await createNotificationChannel({ id: 'reminders', name: 'Reminders', importance: 'high' })

if ((await getPermissionStatus()) === 'undetermined') await requestPermission()

await scheduleNotification({
  title: 'Standup',
  body: 'In five minutes',
  channelId: 'reminders',
  data: { screen: 'calendar' },
  trigger: { type: 'timeInterval', seconds: 300 },
})
```

## Host-app setup

The native sources are declared in `lynx.lib.json`, so Lynx's autolinking picks
them up. What autolinking cannot do for you is credentials and entitlements.

### Android

Local notifications work with no further setup. The library's manifest
contributes `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, the alarm and tap
receivers, and the permission-prompt activity through manifest merging.

The small icon is your app's launcher icon. If you want a dedicated one, add a
`drawable` named for it and override in your own manifest.

For **remote push**, add Firebase to the host app — the library depends on
`firebase-messaging` as `compileOnly`, so an app that only schedules local
notifications does not inherit it:

```kotlin
// app/build.gradle.kts
plugins { id("com.google.gms.google-services") }
dependencies { implementation("com.google.firebase:firebase-messaging:24.0.0") }
```

and drop your `google-services.json` into `app/`.

If your build does not run Lynx's annotation processor, register the module by
hand:

```kotlin
LynxEnv.inst().registerModule(
  "MiniLynxNotificationsModule",
  MiniLynxNotificationsModule::class.java,
)
```

### iOS

Register the module where you configure Lynx:

```objc
[config registerModule:MiniLynxNotificationsModule.class];
```

For **remote push**, add the Push Notifications capability and the
`aps-environment` entitlement, then forward APNs' two app-delegate callbacks —
iOS delivers these to the app delegate and there is no supported way for a
library to intercept them without swizzling:

```objc
#import <MiniLynxNotifications/MiniLynxNotificationsCenter.h>

- (void)application:(UIApplication *)application
    didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken {
  [MiniLynxNotificationsCenter.shared didRegisterForRemoteNotificationsWithDeviceToken:deviceToken];
}

- (void)application:(UIApplication *)application
    didFailToRegisterForRemoteNotificationsWithError:(NSError *)error {
  [MiniLynxNotificationsCenter.shared didFailToRegisterForRemoteNotificationsWithError:error];
}
```

Without this, local notifications work and `getDeviceToken` always resolves
`null`.

## API

| Function | Returns |
| --- | --- |
| `getPermissionStatus()` | `'undetermined' \| 'denied' \| 'granted' \| 'provisional'` |
| `requestPermission(request?)` | the status the user chose |
| `getDeviceToken()` | `DeviceToken \| null` |
| `onDeviceToken(listener)` | unsubscribe |
| `scheduleNotification(request)` | the id it was filed under |
| `cancelNotification(id)` / `cancelAllNotifications()` | — |
| `getScheduledNotifications()` | what has not fired yet |
| `onNotificationReceived(listener)` | unsubscribe (foreground arrivals) |
| `onNotificationResponse(listener)` | unsubscribe (taps, including cold start) |
| `getBadgeCount()` / `setBadgeCount(n)` | — |
| `createNotificationChannel(channel)` | — (Android; no-op on iOS) |
| `isNotificationsAvailable()` | whether the host app linked the module |

## The things that actually bite

- **You get one permission prompt, ever.** iOS shows it once per install;
  Android 13+ stops after two dismissals. A request made after a refusal shows
  nothing and reports the refusal. Check `getPermissionStatus()` first, and spend
  the prompt at a moment the user already understands.
- **Android drops a notification with no valid channel, silently.** Call
  `createNotificationChannel` at startup. The module creates a default channel on
  demand so an app that forgets still delivers, but every notification lands in
  one bucket the user can only turn off wholesale.
- **A channel is immutable after creation.** Android ignores every field but the
  name and description on a channel that already exists. Get the importance right
  first time, or use a new id.
- **A foreground notification shows no banner, by design.** It arrives at
  `onNotificationReceived` and the in-app treatment is yours. A system banner
  over the screen the user is looking at is worse.
- **The device token is not an identifier.** iOS reissues it on reinstall and
  restore; FCM rotates it on its own schedule. Send every arrival to your
  backend — storing the first and assuming it holds is why "push stopped working
  for some users" takes weeks to find.
- **Scheduled notifications are not exact on Android.** They use inexact alarms
  deliberately: exact alarms need `SCHEDULE_EXACT_ALARM`, which Google Play
  restricts to alarm clocks and calendars. Doze can delay one. Fine for a
  reminder, wrong for a countdown.
- **Subscribe to taps at the app root, during the first render.** A cold-start
  tap is held by the native side and replayed once, to whoever subscribes first.

## Testing

`@amritk/mini-lynx-notifications/testing` ships the native module in memory, so
your own screens can be tested with no device:

```ts
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
import { createFakeContexts, createFakeEmitter } from '@amritk/mini-lynx-native/testing'
import { MODULE } from '@amritk/mini-lynx-notifications'
import { createFakeNotifications } from '@amritk/mini-lynx-notifications/testing'

const contexts = createFakeContexts()
const emitter = createFakeEmitter()
const notifications = createFakeNotifications(emitter)
setPeerContext(contexts.mainThread)
installNativeBridge({ peer: contexts.background, emitter, modules: { [MODULE]: notifications.module } })

notifications.deliver({ title: 'Order shipped' })
```

## Status

The TypeScript is tested. **The Kotlin and the Objective-C have not been
compiled or run on a device** — this repository has no Android SDK and no Xcode,
and nothing in its suite can verify them. They are written against the documented
Lynx, Android and iOS APIs, and the fake in `/testing` is the executable
statement of the contract they are supposed to satisfy. Treat the native halves
as a starting point to build and test on a device, not as shipped-and-proven.

## Licence

MIT
