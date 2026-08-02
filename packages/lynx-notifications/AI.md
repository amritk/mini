# AI.md — @amritk/lynx-notifications

For an LLM consuming this package. Editing the repo instead? See
[`AGENTS.md`](./AGENTS.md).

## Mental model

A native module on each platform, plus a promise-shaped facade that reaches it.
`UNUserNotificationCenter` + APNs on iOS; `NotificationManager` + `AlarmManager`
+ FCM on Android.

Everything is a promise, because `NativeModules` lives in Lynx's background
context and a `@amritk/mini-lynx` tree renders on the main thread. There is no
synchronous read of anything here.

## Setup: one line you will forget

```ts
// background chunk — without this every call queues forever and nothing says why
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
installNativeBridge()
```

The native side links itself through `lynx.lib.json`. Credentials do not — see
the README for the APNs entitlement, the two app-delegate forwards, and
`google-services.json`.

## The surface, in full

```ts
import {
  cancelAllNotifications,
  cancelNotification,
  createNotificationChannel,
  getBadgeCount,
  getDeviceToken,
  getPermissionStatus,
  getScheduledNotifications,
  isNotificationsAvailable,
  onDeviceToken,
  onNotificationReceived,
  onNotificationResponse,
  requestPermission,
  scheduleNotification,
  setBadgeCount,
} from '@amritk/lynx-notifications'

getPermissionStatus(): Promise<PermissionStatus>          // 'undetermined' | 'denied' | 'granted' | 'provisional'
requestPermission(request?: PermissionRequest): Promise<PermissionStatus>
getDeviceToken(): Promise<DeviceToken | null>             // { token, service: 'apns' | 'fcm' }
onDeviceToken(listener): () => void
scheduleNotification(request: NotificationRequest): Promise<string>
cancelNotification(id: string): Promise<void>
cancelAllNotifications(): Promise<void>
getScheduledNotifications(): Promise<readonly ScheduledNotification[]>
onNotificationReceived(listener: (n: Notification) => void): () => void
onNotificationResponse(listener: (r: NotificationResponse) => void): () => void
getBadgeCount(): Promise<number>
setBadgeCount(count: number): Promise<void>
createNotificationChannel(channel: NotificationChannel): Promise<void>
isNotificationsAvailable(): Promise<boolean>
```

A trigger is `{ type: 'timeInterval', seconds, repeats? }` or
`{ type: 'date', timestamp }` (milliseconds since the epoch). Omit it to deliver
immediately.

## Gotchas

- **You get one permission prompt, ever.** A request after a refusal shows
  nothing and resolves `denied`. Check `getPermissionStatus()` first and branch:
  `undetermined` → ask, `denied` → explain and link to settings. Prompting
  unconditionally on launch is the classic bug and it never recovers.
- **Do not collapse the four statuses to a boolean.** `denied` and
  `undetermined` need different handling; `provisional` (iOS) means granted but
  quiet.
- **Android drops a notification with no valid channel, in silence.** Call
  `createNotificationChannel` at startup. It is a no-op on iOS, so call it
  unconditionally.
- **A channel is immutable after creation.** Only name and description change on
  an existing one. Wrong importance means a new id.
- **A foreground notification shows no banner.** It arrives at
  `onNotificationReceived`; showing something is your job. A backgrounded arrival
  does *not* come through there — you hear about it only via
  `onNotificationResponse` if the user taps.
- **Subscribe to `onNotificationResponse` at the app root, in the first
  render.** A cold-start tap is held natively and replayed **once**, to whoever
  subscribes first. Subscribing on the screen the notification points at cannot
  work — that screen does not exist yet.
- **Reusing an `id` replaces the notification.** That is the mechanism for
  updating a live one, not a mistake.
- **The device token rotates.** Send every `onDeviceToken` arrival to your
  backend, not just the first `getDeviceToken`.
- **`getDeviceToken()` resolving `null` is normal**, not an error: no permission,
  offline, a simulator with no paired Mac, or a build with no Firebase.
- **Android scheduling is inexact.** Doze can delay it. Fine for reminders,
  wrong for countdowns.
- **`getBadgeCount` on Android reports what this app last set**, not a system
  value — Android has no badge API. iOS is exact.
- **Always unsubscribe.** Every `on*` returns the unsubscribe; register it with
  `onCleanup`.
- **Nothing here is reactive.** Wire a promise into your own signal:
  `const status = signal('undetermined'); getPermissionStatus().then(status)`.
- **Both native halves compile against the real Lynx SDK in CI, but nothing has
  run them on a device.** Permission flows, Doze-delayed alarms, APNs
  registration and FCM delivery are all unverified. See the README's status
  table before treating this as production-ready.
