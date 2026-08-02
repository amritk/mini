#import "MiniLynxDeepLinkingCenter.h"

#import <UIKit/UIKit.h>

#import <Lynx/LynxContext.h>

NSString *const MiniLynxDeepLinkingErrorInvalidURL = @"invalidURL";
NSString *const MiniLynxDeepLinkingErrorNoHandler = @"noHandler";
NSString *const MiniLynxDeepLinkingErrorUnavailable = @"unavailable";

static NSString *const kEventLink = @"mini-lynx:deep-linking:link";

@interface MiniLynxDeepLinkingCenter ()
@property(nonatomic, strong) NSHashTable<LynxContext *> *contexts;
@property(nonatomic, copy, nullable) NSString *initialURL;
/** A link that arrived with no view to publish it into. One slot, most recent wins. */
@property(nonatomic, copy, nullable) NSString *pendingLink;
/**
 * Whether an inbound URL has been offered yet.
 *
 * iOS delivers a launch URL **twice** in a delegate-based app: once in the
 * launch options this class reads itself, and once through
 * `application:openURL:options:` which the host forwards. Only the first
 * inbound URL of the process is eligible to be recognised as that duplicate, so
 * a user re-opening the same link an hour later still gets an event.
 */
@property(nonatomic, assign) BOOL consumedFirstInboundURL;
@end

@implementation MiniLynxDeepLinkingCenter

+ (MiniLynxDeepLinkingCenter *)shared {
  static MiniLynxDeepLinkingCenter *shared = nil;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    shared = [[MiniLynxDeepLinkingCenter alloc] init];
  });
  return shared;
}

/**
 * Starts listening before the app has launched.
 *
 * `+load` runs when the image is loaded, which is before `UIApplicationMain`
 * and therefore before `UIApplicationDidFinishLaunchingNotification` — the one
 * moment at which the launch URL is observable without the host handing it
 * over. Anything later (an initialiser, the first LynxView) is already too
 * late: `launchOptions` is not readable after the fact.
 *
 * This is the only work `+load` does, and it does not touch UIKit beyond
 * naming a notification, so it costs nothing at startup.
 */
+ (void)load {
  [NSNotificationCenter.defaultCenter addObserver:self.shared
                                         selector:@selector(applicationDidFinishLaunching:)
                                             name:UIApplicationDidFinishLaunchingNotification
                                           object:nil];
}

- (instancetype)init {
  if (self = [super init]) {
    // Weak, because a context belongs to a LynxView and outliving it here would
    // keep a whole view tree alive for as long as the process runs.
    _contexts = [NSHashTable weakObjectsHashTable];
    _consumedFirstInboundURL = NO;
  }
  return self;
}

- (void)applicationDidFinishLaunching:(NSNotification *)note {
  // A Universal Link at launch arrives as a user activity in the launch options
  // instead, and a scene-based app gets neither — both are why
  // `handleLaunchURL:` is public and the README asks for one line in
  // `scene:willConnectToSession:`.
  NSURL *url = note.userInfo[UIApplicationLaunchOptionsURLKey];
  if ([url isKindOfClass:NSURL.class]) [self handleLaunchURL:url];
}

#pragma mark - Contexts

- (void)registerContext:(LynxContext *)context {
  @synchronized(self) {
    [self.contexts addObject:context];
  }
}

- (void)unregisterContext:(LynxContext *)context {
  @synchronized(self) {
    [self.contexts removeObject:context];
  }
}

#pragma mark - Inbound

- (void)handleLaunchURL:(NSURL *)url {
  NSString *string = url.absoluteString;
  if (string.length == 0) return;

  BOOL isLaunch = NO;
  @synchronized(self) {
    if (self.initialURL == nil) {
      self.initialURL = string;
      isLaunch = YES;
    }
  }

  // First call wins. A second one is a running app, so it is a link rather than
  // a fact about how this process started.
  if (!isLaunch) [self handleURL:url];
}

- (void)handleURL:(NSURL *)url {
  NSString *string = url.absoluteString;
  if (string.length == 0) return;

  @synchronized(self) {
    if (!self.consumedFirstInboundURL) {
      self.consumedFirstInboundURL = YES;
      // The launch URL, arriving a second time through the delegate. Publishing
      // it would make an app that reads `getInitialURL` *and* subscribes handle
      // one tap twice.
      if (self.initialURL != nil && [string isEqualToString:self.initialURL]) return;
    }
  }

  [self publish:string];
}

- (void)handleUserActivity:(NSUserActivity *)activity {
  if (![activity.activityType isEqualToString:NSUserActivityTypeBrowsingWeb]) return;
  [self handleURL:activity.webpageURL];
}

/** Publishes a link, or holds it when there is no view that could receive one. */
- (void)publish:(NSString *)url {
  NSUInteger count;
  @synchronized(self) {
    count = self.contexts.count;
    if (count == 0) {
      self.pendingLink = url;
      return;
    }
  }
  [self emit:url];
}

- (void)flushPendingLink {
  NSString *held;
  @synchronized(self) {
    held = self.pendingLink;
    self.pendingLink = nil;
  }
  if (held == nil) return;
  [self emit:held];
}

- (void)emit:(NSString *)url {
  NSArray<LynxContext *> *targets;
  @synchronized(self) {
    targets = self.contexts.allObjects;
  }
  for (LynxContext *context in targets) {
    [context sendGlobalEvent:kEventLink withParams:@[ @{@"url" : url} ]];
  }
}

#pragma mark - Outbound

/** The `OpenResult` failure envelope, built on this side of the bridge. */
- (NSDictionary *)failure:(NSString *)code message:(NSString *)message {
  return @{@"ok" : @NO, @"error" : code, @"message" : message};
}

- (void)openURL:(NSString *)url completion:(void (^)(NSDictionary *))completion {
  NSURL *target = [NSURL URLWithString:url];
  if (target == nil || target.scheme.length == 0) {
    completion([self failure:MiniLynxDeepLinkingErrorInvalidURL message:[@"not a URL: " stringByAppendingString:url]]);
    return;
  }

  // `UIApplication` is main-thread-only and a bridge call is not on the main
  // thread. This is also why the JavaScript side is callback-shaped: there is
  // no answer to give in the same turn.
  dispatch_async(dispatch_get_main_queue(), ^{
    UIApplication *application = UIApplication.sharedApplication;
    if (![application canOpenURL:target]) {
      // Not "nothing is installed" but "this app cannot see anything": iOS
      // answers NO for any scheme missing from LSApplicationQueriesSchemes.
      completion([self failure:MiniLynxDeepLinkingErrorNoHandler
                       message:[@"nothing this app can see handles " stringByAppendingString:url]]);
      return;
    }
    [application openURL:target
                  options:@{}
        completionHandler:^(BOOL opened) {
          if (opened) {
            completion(@{@"ok" : @YES});
            return;
          }
          completion([self failure:MiniLynxDeepLinkingErrorUnavailable
                           message:[@"the system refused to open " stringByAppendingString:url]]);
        }];
  });
}

- (void)canOpenURL:(NSString *)url completion:(void (^)(BOOL))completion {
  NSURL *target = [NSURL URLWithString:url];
  if (target == nil || target.scheme.length == 0) {
    completion(NO);
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    completion([UIApplication.sharedApplication canOpenURL:target]);
  });
}

- (void)openSettingsWithCompletion:(void (^)(BOOL))completion {
  NSURL *settings = [NSURL URLWithString:UIApplicationOpenSettingsURLString];
  if (settings == nil) {
    completion(NO);
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    [UIApplication.sharedApplication openURL:settings
                                     options:@{}
                           completionHandler:^(BOOL opened) {
                             completion(opened);
                           }];
  });
}

@end
