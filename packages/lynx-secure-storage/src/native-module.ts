/**
 * The names and numbers this package and its native halves agree on.
 *
 * Every string that crosses to Kotlin or Objective-C is here, so a rename is
 * one edit on each side rather than a search. The module name is the key the
 * native code registers itself under — `@LynxNativeModule(name = …)` on
 * Android, `+name` on iOS.
 *
 * ## There are no events here
 *
 * `@amritk/lynx-notifications`, `@amritk/lynx-location` and
 * `@amritk/lynx-deep-linking` all publish through `GlobalEventEmitter`, because
 * something outside the app decides when they have news. Nothing outside the
 * app writes to this store: every value in it got there because this package
 * put it there, so every method is the plain request/response shape
 * `callNativeAsync` was built for. This package has no `Events` file, no
 * context fan-out and no cold-start buffer to keep in step across two
 * languages — the same shape `@amritk/lynx-dialogs` has, for a different
 * reason.
 */

/** The key `NativeModules` exposes the module under. */
export const MODULE = 'MiniLynxSecureStorageModule'

/**
 * The largest value this package will store, in UTF-8 bytes.
 *
 * Neither platform imposes this. The Keychain will take a much larger blob and
 * `EncryptedSharedPreferences` will take one until the XML file becomes a
 * problem, and *that* is the reason for a cap: without one, the size at which
 * a write starts failing is a different number on each platform, discovered on
 * a device, by a user. 8 KiB is comfortably more than any bearer token, JWT or
 * key pair, and comfortably less than anything that should be in a file.
 *
 * Both native halves enforce this number and answer `tooLarge`;
 * `src/native-contract.test.ts` checks that the number in the two languages is
 * still this one.
 */
export const MAX_VALUE_BYTES = 8192
