/**
 * The names this package and its native halves agree on.
 *
 * Every string that crosses to Kotlin or Objective-C is here, so a rename is
 * one edit on each side rather than a search. The module name is the key the
 * native code registers itself under — `@LynxNativeModule(name = …)` on
 * Android, `+name` on iOS — and the event name is what `sendGlobalEvent`
 * publishes.
 */

/** The key `NativeModules` exposes the module under. */
export const MODULE = 'MiniLynxDeepLinkingModule'

/**
 * The events the native side publishes through `sendGlobalEvent`.
 *
 * Prefixed so they cannot collide with an app's own global events, or with
 * another framework's on a page running two.
 *
 * There is exactly one, and deliberately so: a link that arrives while the app
 * is running is the only thing native code has to push. The link that *started*
 * the app is a value to be read rather than an event to be caught — see
 * `getInitialURL` — because at the moment it arrives there is no JavaScript in
 * the process to catch anything.
 */
export const EVENTS = {
  /** A URL was handed to the app while it was already running. */
  link: 'mini-lynx:deep-linking:link',
} as const
