#import <Foundation/Foundation.h>
#import <Lynx/LynxContextModule.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * The iOS half of `@amritk/lynx-notifications`.
 *
 * Every method is the other end of one function in the package's TypeScript,
 * and `src/testing/create-fake-notifications.ts` is the executable statement of
 * the contract they share.
 *
 * `LynxContextModule` rather than plain `LynxModule` because publishing an
 * event needs a `LynxContext` to send it through.
 *
 * Registration is the host app's, one line at startup:
 *
 * ```objc
 * [config registerModule:MiniLynxNotificationsModule.class];
 * ```
 */
@interface MiniLynxNotificationsModule : NSObject <LynxContextModule>

@end

NS_ASSUME_NONNULL_END
