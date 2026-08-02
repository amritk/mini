/**
 * The names this package and its native halves agree on.
 *
 * Every string that crosses to Kotlin or Objective-C is here, so a rename is
 * one edit on each side rather than a search. The module name is the key the
 * native code registers itself under — `@LynxNativeModule(name = …)` on
 * Android, `+name` on iOS — and the event names are what `sendGlobalEvent`
 * publishes.
 */

/** The key `NativeModules` exposes the module under. */
export const MODULE = 'MiniLynxLocationModule'

/**
 * The events the native side publishes through `sendGlobalEvent`.
 *
 * Prefixed so they cannot collide with an app's own global events, or with
 * another framework's on a page running two.
 *
 * Both carry a `watchId`, because one native module serves every watch in the
 * app and the fan-out is one emitter listener per event name. Filtering by that
 * id is `watch-position.ts`'s job.
 */
export const EVENTS = {
  /** A watch produced a new fix. */
  position: 'mini-lynx:location:position',
  /** A watch failed. The watch stays registered; see `WatchUpdate`. */
  error: 'mini-lynx:location:error',
} as const
