#import <Foundation/Foundation.h>
#import <Lynx/LynxContextModule.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * The iOS half of `@amritk/lynx-location`.
 *
 * Every method is the other end of one function in the package's TypeScript,
 * and `src/testing/create-fake-location.ts` is the executable statement of the
 * contract they share.
 *
 * `LynxContextModule` rather than plain `LynxModule` because publishing a watch
 * update needs a `LynxContext` to send it through.
 *
 * Registration is the host app's, one line at startup:
 *
 * ```objc
 * [config registerModule:MiniLynxLocationModule.class];
 * ```
 *
 * The host app also owns `NSLocationWhenInUseUsageDescription` in its
 * `Info.plist`. Without it iOS terminates the app the moment it asks for
 * permission, and no library can supply it — see this package's README.
 */
@interface MiniLynxLocationModule : NSObject <LynxContextModule>

@end

NS_ASSUME_NONNULL_END
