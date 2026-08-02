/**
 * The names this package and its native halves agree on.
 *
 * Every string that crosses to Kotlin or Objective-C is here, so a rename is
 * one edit on each side rather than a search. The module name is the key the
 * native code registers itself under — `@LynxNativeModule(name = …)` on
 * Android, `+name` on iOS.
 *
 * ## There are no events here, and that is the whole shape of this package
 *
 * `@amritk/lynx-notifications` and `@amritk/lynx-location` both publish through
 * `GlobalEventEmitter`, because a notification arrives when the system decides
 * and a watch produces a stream. A dialog does neither: the app asks, the user
 * answers once, and it is over. That makes every method here the plain
 * request/response shape `callNativeAsync` was built for, and it is why this
 * package has no `Events` file, no context fan-out and no cold-start buffer to
 * keep in step across two languages.
 */

/** The key `NativeModules` exposes the module under. */
export const MODULE = 'MiniLynxDialogsModule'
