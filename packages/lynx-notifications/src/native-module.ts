/**
 * The names this package and its native halves agree on.
 *
 * Every string that crosses to Kotlin or Swift is here, so a rename is one edit
 * on each side rather than a search. The module name is the key the native code
 * registers itself under — `@LynxNativeModule(name = …)` on Android,
 * `+[name]` on iOS — and the event names are what `sendGlobalEvent` publishes.
 */

/** The key `NativeModules` exposes the module under. */
export const MODULE = 'MiniLynxNotificationsModule'

/**
 * The events the native side publishes through `sendGlobalEvent`.
 *
 * Prefixed so they cannot collide with an app's own global events, or with
 * another framework's on a page running two.
 */
export const EVENTS = {
  /** A notification arrived while the app was in the foreground. */
  received: 'mini-lynx:notifications:received',
  /** The user tapped a notification, or used one of its actions. */
  response: 'mini-lynx:notifications:response',
  /** A remote-push token was issued or rotated. */
  token: 'mini-lynx:notifications:token',
} as const
