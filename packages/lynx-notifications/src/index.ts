/**
 * `@amritk/lynx-notifications` — local and remote push notifications for
 * Lynx.
 *
 * Lynx ships no notifications module and, at the time of writing, neither does
 * Sparkling — its `sparkling-notifications` is a reserved name with no
 * implementation behind it. The official answer is "write native code and send
 * it into your Lynx code", so that is what this package is: an Android module,
 * an iOS module, and a promise-shaped facade that reaches them.
 *
 * ## What you have to wire up
 *
 * Two things, once each.
 *
 * ```ts
 * // 1. background chunk — the bridge that carries every call
 * import { installNativeBridge } from '@amritk/mini-lynx-native/background'
 *
 * installNativeBridge()
 * ```
 *
 * ```tsx
 * // 2. anywhere on the main thread — the app itself
 * import { getPermissionStatus, requestPermission, scheduleNotification } from '@amritk/lynx-notifications'
 *
 * if ((await getPermissionStatus()) === 'undetermined') await requestPermission()
 * await scheduleNotification({ title: 'Standup', trigger: { type: 'timeInterval', seconds: 300 } })
 * ```
 *
 * The native side links itself: `lynx.lib.json` in this package declares the
 * Android and iOS sources, and Lynx's autolinking picks them up. What it cannot
 * do for you is credentials — an APNs entitlement and a Firebase
 * `google-services.json` — because those are your app's, not a library's.
 * `README.md` has the full host-app setup.
 *
 * ## Why there are no signals here
 *
 * Because a second edge onto the signal engine is how a consumer ends up with
 * two reactive graphs that cannot see each other's writes — a failure that
 * typechecks, runs, and silently stops updating. `@amritk/mini-helpers` is kept
 * off `alien-signals` for exactly this reason and this package follows it: the
 * surface is promises and subscriptions, and turning that into a signal is one
 * line in an app that already has one.
 *
 * ```ts
 * const status = signal<PermissionStatus>('undetermined')
 * getPermissionStatus().then(status)
 * ```
 *
 * It also means the package works unchanged from ReactLynx, Vue Lynx, or plain
 * background-thread code, which a signals-shaped API would not.
 */
export { cancelAllNotifications } from './cancel-all-notifications'
export { cancelNotification } from './cancel-notification'
export { createNotificationChannel } from './create-notification-channel'
export { getBadgeCount } from './get-badge-count'
export { getDeviceToken } from './get-device-token'
export { getPermissionStatus } from './get-permission-status'
export { getScheduledNotifications } from './get-scheduled-notifications'
export { isNotificationsAvailable } from './is-notifications-available'
export { EVENTS, MODULE } from './native-module'
export { onDeviceToken } from './on-device-token'
export { onNotificationReceived } from './on-notification-received'
export { onNotificationResponse } from './on-notification-response'
export { requestPermission } from './request-permission'
export { scheduleNotification } from './schedule-notification'
export { setBadgeCount } from './set-badge-count'
export type {
  DeviceToken,
  Notification,
  NotificationChannel,
  NotificationRequest,
  NotificationResponse,
  NotificationTrigger,
  PermissionRequest,
  PermissionStatus,
  ScheduledNotification,
} from './types'
