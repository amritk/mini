#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * The error codes that cross to JavaScript, spelled once.
 *
 * They are `SecureWriteError` on the other side and `StorageResults` in the
 * Kotlin; `src/native-contract.test.ts` checks all three still agree, because a
 * code only one platform can report is a branch an app writes and never sees
 * fire.
 */
extern NSString *const MiniLynxSecureStorageErrorUnavailable;
extern NSString *const MiniLynxSecureStorageErrorKeystoreFailure;
extern NSString *const MiniLynxSecureStorageErrorTooLarge;

/**
 * Every Keychain operation this package performs, and the result dictionary each
 * one answers with.
 *
 * `kSecClassGenericPassword` items under a `kSecAttrService` of this app's
 * bundle identifier — so a host app's own Keychain items are never in scope,
 * and neither is another library's.
 *
 * ## Nothing here is asynchronous, and nothing here is on the main thread
 *
 * `SecItem*` is synchronous and can block: the first call after a boot may wait
 * on the keybag. The module dispatches every call onto a serial queue of its
 * own, which is also what serialises the first-run check below.
 *
 * ## Nothing here logs
 *
 * Not the key, not the value, not at any level. A failure is described by its
 * `OSStatus`, which says what went wrong without saying what it was doing it
 * to.
 */
@interface MiniLynxSecureStorageKeychain : NSObject

/**
 * Runs the once-per-process first-run check.
 *
 * Keychain items survive an app being deleted, so a reinstall can find a live
 * session belonging to an install the user deliberately removed. The flag that
 * detects it lives in `NSUserDefaults`, which does *not* survive an uninstall —
 * finding it missing means this is a fresh install, and the store is cleared
 * before anything can read it.
 *
 * Called at the head of every operation rather than at module init: a module is
 * created per LynxView and the first read can happen before the second view
 * exists, so tying it to init would leave a window where the previous install's
 * value is readable.
 */
+ (void)prepare;

/** `{ ok: YES, value: <string> }`, `{ ok: YES, value: null }` when absent, or a failure. */
+ (NSDictionary *)read:(NSString *)key;

/**
 * `{ ok: YES }` or a failure.
 *
 * `accessibility` is `whenUnlocked` or `afterFirstUnlock`; anything else, `nil`
 * included, takes the `afterFirstUnlock` default.
 */
+ (NSDictionary *)write:(NSString *)key value:(NSString *)value accessibility:(nullable NSString *)accessibility;

/** `{ ok: YES }`. Deleting a key that is not there is not a failure. */
+ (NSDictionary *)remove:(NSString *)key;

/** `{ ok: YES, value: <bool> }`. Never decrypts the value to answer. */
+ (NSDictionary *)contains:(NSString *)key;

/** `{ ok: YES }`. Deletes only this app's items in this package's service. */
+ (NSDictionary *)clear;

/** Whether the Keychain answers this process at all. Writes nothing to find out. */
+ (BOOL)isAvailable;

@end

NS_ASSUME_NONNULL_END
