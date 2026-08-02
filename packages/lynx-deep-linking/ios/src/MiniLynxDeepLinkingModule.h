#import <Foundation/Foundation.h>
#import <Lynx/LynxContextModule.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * The iOS half of `@amritk/lynx-deep-linking`.
 *
 * Every method is the other end of one function in the package's TypeScript,
 * and `src/testing/create-fake-deep-linking.ts` is the executable statement of
 * the contract they share.
 *
 * `LynxContextModule` rather than plain `LynxModule` because publishing a link
 * needs a `LynxContext` to send it through.
 *
 * Registration is the host app's, one line at startup:
 *
 * ```objc
 * [config registerModule:MiniLynxDeepLinkingModule.class];
 * ```
 *
 * The host app also owns its `CFBundleURLTypes` — the scheme this app answers
 * to — and forwards the delegate callbacks that carry a link into a running
 * app. No library can supply either; see this package's README.
 */
@interface MiniLynxDeepLinkingModule : NSObject <LynxContextModule>

@end

NS_ASSUME_NONNULL_END
