#import <Foundation/Foundation.h>

@class LynxContext;

NS_ASSUME_NONNULL_BEGIN

/**
 * The failure codes that cross to JavaScript, as `OpenErrorCode` spells them.
 *
 * Constants rather than literals at the call sites because a typo in one is a
 * branch on the other side that silently never runs, and no compiler on either
 * side can see it. `src/native-contract.test.ts` reads this file to check that
 * Kotlin and Objective-C know the same three.
 */
extern NSString *const MiniLynxDeepLinkingErrorInvalidURL;
extern NSString *const MiniLynxDeepLinkingErrorNoHandler;
extern NSString *const MiniLynxDeepLinkingErrorUnavailable;

/**
 * The process-wide half of the iOS implementation: the launch URL, the fan-out
 * to every live LynxContext, and the calls into `UIApplication`.
 *
 * It is a singleton because what it holds is: there is one launch, one
 * `UIApplication`, and one answer to "what URL started this process". A
 * per-LynxView object would have a different answer per view.
 *
 * ## Where the inbound URLs come from
 *
 * A **cold start** is captured automatically. The class registers for
 * `UIApplicationDidFinishLaunchingNotification` in `+load`, which runs when the
 * binary is loaded — before `UIApplicationMain`, and therefore before the
 * notification it is waiting for. That is the iOS counterpart of the Android
 * half's `ContentProvider`, and it is why `getInitialURL` needs no host wiring
 * in an app that still uses an app delegate.
 *
 * Everything else has to be forwarded, and there is no way around it: iOS
 * delivers `application:openURL:options:`, `scene:openURLContexts:` and
 * `application:continueUserActivity:restorationHandler:` to the app's own
 * delegate, and there is no supported way for a library to intercept them
 * without swizzling. `@amritk/lynx-notifications` makes the same bargain for
 * its APNs callbacks. This package's README has the three one-line snippets.
 */
@interface MiniLynxDeepLinkingCenter : NSObject

@property(class, nonatomic, readonly) MiniLynxDeepLinkingCenter *shared;

/** The URL that launched this process, or nil. Fixed for the process's lifetime. */
@property(nonatomic, copy, nullable, readonly) NSString *initialURL;

/** Registers a context so links reach the LynxView it belongs to. */
- (void)registerContext:(LynxContext *)context;
- (void)unregisterContext:(LynxContext *)context;

/**
 * Records the URL that launched the app.
 *
 * Called automatically from the launch notification, and by a **scene-based**
 * host from `scene:willConnectToSession:options:` — where iOS puts the URL in
 * the scene's connection options and *not* in the app's launch options, so the
 * automatic path cannot see it. First call wins; later ones fall through to
 * `handleURL:`.
 */
- (void)handleLaunchURL:(nullable NSURL *)url;

/** Publishes a URL that arrived at a running app. */
- (void)handleURL:(nullable NSURL *)url;

/**
 * Publishes the URL of a Universal Link.
 *
 * A `https://` link into the app arrives as an `NSUserActivity` rather than as
 * a URL, so a host forwards the activity and this takes the `webpageURL` off
 * it. Activities of any other type are ignored.
 */
- (void)handleUserActivity:(nullable NSUserActivity *)activity;

/** Replays a link that arrived with no view to receive it, at most once. */
- (void)flushPendingLink;

/** Hands a URL to the system, answering with an `OpenResult` dictionary. */
- (void)openURL:(NSString *)url completion:(void (^)(NSDictionary *result))completion;

/** Whether anything visible to this app claims the URL. */
- (void)canOpenURL:(NSString *)url completion:(void (^)(BOOL canOpen))completion;

/** Opens this app's page in Settings. */
- (void)openSettingsWithCompletion:(void (^)(BOOL opened))completion;

@end

NS_ASSUME_NONNULL_END
