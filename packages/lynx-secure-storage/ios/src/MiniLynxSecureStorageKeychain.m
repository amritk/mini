#import "MiniLynxSecureStorageKeychain.h"

#import <Security/Security.h>

NSString *const MiniLynxSecureStorageErrorUnavailable = @"unavailable";
NSString *const MiniLynxSecureStorageErrorKeystoreFailure = @"keystoreFailure";
NSString *const MiniLynxSecureStorageErrorTooLarge = @"tooLarge";

/**
 * The largest value this package stores, in UTF-8 bytes. Mirrors
 * `MAX_VALUE_BYTES` in TypeScript and `SecureStore.MAX_VALUE_BYTES` in Kotlin,
 * and `src/native-contract.test.ts` checks the three are still the same number.
 */
static NSUInteger const kMiniLynxSecureStorageMaxValueBytes = 8192;

/**
 * The first-run marker, in `NSUserDefaults`.
 *
 * `NSUserDefaults` is cleared when the app is deleted and the Keychain is not,
 * which is the entire reason this works: the absence of this flag is the only
 * signal iOS gives a process that it is a fresh install.
 */
static NSString *const kMiniLynxSecureStorageInstalledFlag = @"dev.amritk.minilynx.securestorage.installed";

/**
 * The service every item is filed under.
 *
 * The bundle identifier, so two apps built from the same code do not share a
 * store and a host app's own generic passwords are never in scope. The fallback
 * is for the one case where there is no bundle identifier — a unit-test host —
 * and it is a constant rather than an empty string because `kSecAttrService` of
 * `nil` would silently widen every query to *every* generic password the app
 * can see, which `clear` would then delete.
 */
static NSString *MiniLynxSecureStorageService(void) {
  NSString *bundleIdentifier = NSBundle.mainBundle.bundleIdentifier;
  return bundleIdentifier.length > 0 ? bundleIdentifier : @"dev.amritk.minilynx.securestorage";
}

/**
 * The protection class an item is written with.
 *
 * **The `ThisDeviceOnly` suffix on both is load-bearing.** Without it an item
 * is eligible for iCloud Keychain and for encrypted iTunes/Finder backups, so a
 * credential this package was asked to keep on one device ends up on every
 * other device the user owns and inside a backup file on a laptop. There is no
 * option here that turns that on, deliberately: a token that syncs is a
 * different product decision, and it is not one a storage library gets to make
 * on an app's behalf.
 */
static CFStringRef MiniLynxSecureStorageAccessible(NSString *accessibility) {
  if ([accessibility isEqualToString:@"whenUnlocked"]) return kSecAttrAccessibleWhenUnlockedThisDeviceOnly;
  // `afterFirstUnlock`, and the default for anything unrecognised: readable by
  // background work after a reboot, which is what a session token has to be.
  return kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly;
}

/** The class-and-service query every operation starts from. A nil key matches every item. */
static NSMutableDictionary *MiniLynxSecureStorageQuery(NSString *_Nullable key) {
  NSMutableDictionary *query = [NSMutableDictionary dictionary];
  query[(__bridge id)kSecClass] = (__bridge id)kSecClassGenericPassword;
  query[(__bridge id)kSecAttrService] = MiniLynxSecureStorageService();
  if (key != nil) query[(__bridge id)kSecAttrAccount] = key;
  return query;
}

static NSDictionary *MiniLynxSecureStorageFailure(NSString *error, NSString *message) {
  return @{@"ok" : @NO, @"error" : error, @"message" : message};
}

/**
 * Turns an `OSStatus` into one of the two error codes a failed operation can
 * report.
 *
 * The split is between "not right now" and "not at all", because that is the
 * difference an app acts on. A locked device, a keybag that is not up yet and a
 * process with no keychain-access entitlement are all `unavailable`: the same
 * call will work later, or in a different build. Anything else is
 * `keystoreFailure`, which is not going to fix itself.
 *
 * The status number goes in the message and nothing else does. It names what
 * the Keychain said, not what it was asked about.
 */
static NSDictionary *MiniLynxSecureStorageFailureForStatus(OSStatus status) {
  if (status == errSecInteractionNotAllowed || status == errSecNotAvailable || status == errSecAuthFailed) {
    return MiniLynxSecureStorageFailure(
        MiniLynxSecureStorageErrorUnavailable,
        [NSString stringWithFormat:@"the keychain is not readable right now (OSStatus %d)", (int)status]);
  }
  if (status == errSecMissingEntitlement) {
    return MiniLynxSecureStorageFailure(
        MiniLynxSecureStorageErrorUnavailable,
        @"this build has no keychain-access entitlement, so nothing can be stored");
  }
  return MiniLynxSecureStorageFailure(
      MiniLynxSecureStorageErrorKeystoreFailure,
      [NSString stringWithFormat:@"the keychain refused the operation (OSStatus %d)", (int)status]);
}

@implementation MiniLynxSecureStorageKeychain

+ (void)prepare {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    if ([defaults boolForKey:kMiniLynxSecureStorageInstalledFlag]) return;

    NSDictionary *cleared = [self clear];
    // The flag is set only once the clear has actually happened. A first launch
    // that could not reach the keychain — no entitlement, or a device still on
    // the lock screen after a boot — must try again next launch rather than
    // record a wipe that did not occur and leave the previous install's
    // credential readable forever.
    if ([cleared[@"ok"] boolValue]) [defaults setBool:YES forKey:kMiniLynxSecureStorageInstalledFlag];
  });
}

+ (NSDictionary *)read:(NSString *)key {
  [self prepare];

  NSMutableDictionary *query = MiniLynxSecureStorageQuery(key);
  query[(__bridge id)kSecReturnData] = @YES;
  query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;

  CFTypeRef found = NULL;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &found);

  // A key that is not there is an ordinary answer and never a failure — the
  // whole facade is built on `null` meaning exactly this and nothing else.
  if (status == errSecItemNotFound) return @{@"ok" : @YES, @"value" : NSNull.null};
  if (status != errSecSuccess) return MiniLynxSecureStorageFailureForStatus(status);

  NSData *data = (__bridge_transfer NSData *)found;
  NSString *value = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  if (value == nil) {
    // Only reachable if something other than this package wrote the item, since
    // everything written here is UTF-8 by construction. Reported rather than
    // answered as absent, because absent is a claim about the user's state.
    return MiniLynxSecureStorageFailure(MiniLynxSecureStorageErrorKeystoreFailure,
                                        @"the stored item is not valid UTF-8");
  }
  return @{@"ok" : @YES, @"value" : value};
}

+ (NSDictionary *)write:(NSString *)key value:(NSString *)value accessibility:(NSString *)accessibility {
  [self prepare];

  NSData *data = [value dataUsingEncoding:NSUTF8StringEncoding];
  if (data == nil) {
    return MiniLynxSecureStorageFailure(MiniLynxSecureStorageErrorKeystoreFailure,
                                        @"the value could not be encoded as UTF-8");
  }
  if (data.length > kMiniLynxSecureStorageMaxValueBytes) {
    return MiniLynxSecureStorageFailure(
        MiniLynxSecureStorageErrorTooLarge,
        [NSString stringWithFormat:@"a value may be at most %lu bytes",
                                   (unsigned long)kMiniLynxSecureStorageMaxValueBytes]);
  }

  NSDictionary *attributes = @{
    (__bridge id)kSecValueData : data,
    (__bridge id)kSecAttrAccessible : (__bridge id)MiniLynxSecureStorageAccessible(accessibility),
  };

  // Update first, and add only when there was nothing to update.
  //
  // The obvious spelling — delete, then add — has a window between the two
  // calls in which the credential simply does not exist. A process killed
  // inside that window leaves the user signed out with nothing to explain it,
  // and the system kills apps exactly there: in the background, mid-write.
  // `SecItemUpdate` has no such window, and it can change `kSecAttrAccessible`
  // in the same call, so a re-write with a different accessibility does not
  // need one either.
  OSStatus status = SecItemUpdate((__bridge CFDictionaryRef)MiniLynxSecureStorageQuery(key),
                                  (__bridge CFDictionaryRef)attributes);

  if (status == errSecItemNotFound) {
    NSMutableDictionary *insert = MiniLynxSecureStorageQuery(key);
    [insert addEntriesFromDictionary:attributes];
    status = SecItemAdd((__bridge CFDictionaryRef)insert, NULL);
  }

  if (status != errSecSuccess) return MiniLynxSecureStorageFailureForStatus(status);
  return @{@"ok" : @YES};
}

+ (NSDictionary *)remove:(NSString *)key {
  [self prepare];

  OSStatus status = SecItemDelete((__bridge CFDictionaryRef)MiniLynxSecureStorageQuery(key));
  // Deleting what is not there is what a second sign-out does, and it is not a
  // failure on either platform.
  if (status != errSecSuccess && status != errSecItemNotFound) {
    return MiniLynxSecureStorageFailureForStatus(status);
  }
  return @{@"ok" : @YES};
}

+ (NSDictionary *)contains:(NSString *)key {
  [self prepare];

  NSMutableDictionary *query = MiniLynxSecureStorageQuery(key);
  query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
  // No `kSecReturnData`, so the item is matched without its value being
  // decrypted or copied anywhere. The result pointer is NULL for the same
  // reason: nothing about the item needs to come back to answer this.
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, NULL);

  if (status == errSecSuccess) return @{@"ok" : @YES, @"value" : @YES};
  if (status == errSecItemNotFound) return @{@"ok" : @YES, @"value" : @NO};
  return MiniLynxSecureStorageFailureForStatus(status);
}

+ (NSDictionary *)clear {
  // Deliberately does not call `prepare`: this is what `prepare` calls.

  // A query with no `kSecAttrAccount` matches every item in this service, and
  // the service is this app's bundle identifier — so a host app's own generic
  // passwords, filed under services of their own, are not in scope.
  OSStatus status = SecItemDelete((__bridge CFDictionaryRef)MiniLynxSecureStorageQuery(nil));
  if (status != errSecSuccess && status != errSecItemNotFound) {
    return MiniLynxSecureStorageFailureForStatus(status);
  }
  return @{@"ok" : @YES};
}

+ (BOOL)isAvailable {
  // Probes with a read the store is not expected to satisfy, and writes
  // nothing: an availability check that left an item behind would be a
  // side effect in the one place this package must not have any.
  NSMutableDictionary *query = MiniLynxSecureStorageQuery(@"dev.amritk.minilynx.securestorage.probe");
  query[(__bridge id)kSecMatchLimit] = (__bridge id)kSecMatchLimitOne;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, NULL);

  // `errSecItemNotFound` is the healthy answer here: the keychain answered, and
  // said there is no such item. Anything else — no entitlement, a keybag that
  // is not up — means this process cannot store a secret right now.
  return status == errSecSuccess || status == errSecItemNotFound;
}

@end
