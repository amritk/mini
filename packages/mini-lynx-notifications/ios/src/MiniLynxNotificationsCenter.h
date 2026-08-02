#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>

@class LynxContext;

NS_ASSUME_NONNULL_BEGIN

/**
 * The process-wide half of the iOS implementation: the notification centre
 * delegate, the APNs token, and the fan-out to every live LynxContext.
 *
 * It is a singleton because the things it owns are: there is one
 * `UNUserNotificationCenter` delegate slot per process, and one APNs
 * registration. A per-LynxView object would fight itself over both.
 */
@interface MiniLynxNotificationsCenter : NSObject <UNUserNotificationCenterDelegate>

@property(class, nonatomic, readonly) MiniLynxNotificationsCenter *shared;

/** The APNs token, hex-encoded, once one has been registered. */
@property(nonatomic, copy, nullable, readonly) NSString *deviceToken;

/** Starts observing the notification centre. Safe to call repeatedly. */
- (void)install;

/** Registers a context so events reach the LynxView it belongs to. */
- (void)registerContext:(LynxContext *)context;
- (void)unregisterContext:(LynxContext *)context;

/** Publishes to every live context. */
- (void)emit:(NSString *)name payload:(NSDictionary *)payload;

/**
 * Replays a notification response that arrived before any JavaScript could hear
 * it — the cold-start tap. Returns whether there was one held.
 */
- (BOOL)flushPendingResponse;

/**
 * The two APNs callbacks a host app forwards from its `UIApplicationDelegate`.
 * See this package's README: iOS delivers these to the app delegate and there
 * is no supported way for a library to intercept them without swizzling.
 */
- (void)didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken;
- (void)didFailToRegisterForRemoteNotificationsWithError:(NSError *)error;

@end

NS_ASSUME_NONNULL_END
