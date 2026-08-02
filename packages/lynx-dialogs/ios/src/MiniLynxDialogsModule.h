#import <Foundation/Foundation.h>
#import <Lynx/LynxContextModule.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * The iOS half of `@amritk/lynx-dialogs`.
 *
 * Every method is the other end of one function in the package's TypeScript,
 * and `src/testing/create-fake-dialogs.ts` is the executable statement of the
 * contract they share.
 *
 * Registration is the host app's, one line at startup:
 *
 * ```objc
 * [config registerModule:MiniLynxDialogsModule.class];
 * ```
 *
 * Unlike the other native modules in this repository there is **no
 * `Info.plist` key** to add and no permission to request — presenting a dialog
 * is not a capability iOS gates.
 */
@interface MiniLynxDialogsModule : NSObject <LynxContextModule>

@end

NS_ASSUME_NONNULL_END
