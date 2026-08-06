#import <Foundation/Foundation.h>
#import <Lynx/LynxContextModule.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * The iOS half of `@amritk/lynx-secure-storage`.
 *
 * Every method is the other end of one function in the package's TypeScript,
 * and `src/testing/create-fake-secure-storage.ts` is the executable statement
 * of the contract they share.
 *
 * Registration is the host app's, one line at startup:
 *
 * ```objc
 * [config registerModule:MiniLynxSecureStorageModule.class];
 * ```
 *
 * There is **no `Info.plist` key** to add and no permission to request — a
 * keychain item is not a capability iOS gates. What a host does need is the
 * Keychain Sharing capability *if* it wants these items shared with an app
 * group, which this package deliberately does not do: no `kSecAttrAccessGroup`
 * is ever set, so items belong to this app alone.
 */
@interface MiniLynxSecureStorageModule : NSObject <LynxContextModule>

@end

NS_ASSUME_NONNULL_END
