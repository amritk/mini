#import "MiniLynxNotificationsCenter.h"

#import <Lynx/LynxContext.h>

static NSString *const kEventReceived = @"mini-lynx:notifications:received";
static NSString *const kEventResponse = @"mini-lynx:notifications:response";
static NSString *const kEventToken = @"mini-lynx:notifications:token";

@interface MiniLynxNotificationsCenter ()
@property(nonatomic, strong) NSHashTable<LynxContext *> *contexts;
@property(nonatomic, strong, nullable) NSDictionary *pendingResponse;
@property(nonatomic, weak, nullable) id<UNUserNotificationCenterDelegate> previousDelegate;
@property(nonatomic, assign) BOOL installed;
@property(nonatomic, copy, nullable, readwrite) NSString *deviceToken;
@end

@implementation MiniLynxNotificationsCenter

+ (MiniLynxNotificationsCenter *)shared {
  static MiniLynxNotificationsCenter *shared = nil;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    shared = [[MiniLynxNotificationsCenter alloc] init];
  });
  return shared;
}

- (instancetype)init {
  if (self = [super init]) {
    // Weak, because a context belongs to a LynxView and outliving it here would
    // keep a whole view tree alive for as long as the process runs.
    _contexts = [NSHashTable weakObjectsHashTable];
  }
  return self;
}

- (void)install {
  @synchronized(self) {
    if (self.installed) return;
    self.installed = YES;

    UNUserNotificationCenter *center = UNUserNotificationCenter.currentNotificationCenter;
    // There is exactly one delegate slot, so whoever assigns last wins and
    // everyone else is silently gone. Rather than take it outright, the
    // previous delegate is kept and every callback below chains to it — the
    // same bargain the JavaScript runtime makes with `runWorklet`, and for the
    // same reason: a host app may legitimately already be handling
    // notifications of its own.
    if (center.delegate != self) {
      self.previousDelegate = center.delegate;
      center.delegate = self;
    }
  }
}

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

- (void)emit:(NSString *)name payload:(NSDictionary *)payload {
  NSArray<LynxContext *> *targets;
  @synchronized(self) {
    targets = self.contexts.allObjects;
  }
  for (LynxContext *context in targets) {
    [context sendGlobalEvent:name withParams:@[ payload ]];
  }
}

- (void)emitResponse:(NSDictionary *)payload {
  NSUInteger count;
  @synchronized(self) {
    count = self.contexts.count;
  }
  // Nothing is up yet, so this is a cold start: hold it rather than shout into
  // an empty process. `flushPendingResponse` replays it when JavaScript asks.
  if (count == 0) {
    @synchronized(self) {
      self.pendingResponse = payload;
    }
    return;
  }
  [self emit:kEventResponse payload:payload];
}

- (BOOL)flushPendingResponse {
  NSDictionary *held;
  @synchronized(self) {
    held = self.pendingResponse;
    self.pendingResponse = nil;
  }
  if (held == nil) return NO;
  [self emit:kEventResponse payload:held];
  return YES;
}

#pragma mark - APNs

- (void)didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken {
  // APNs hands back raw bytes; every backend and every APNs client wants the
  // hex string. Doing the conversion here means an app never has to.
  const unsigned char *bytes = deviceToken.bytes;
  NSMutableString *hex = [NSMutableString stringWithCapacity:deviceToken.length * 2];
  for (NSUInteger index = 0; index < deviceToken.length; index++) {
    [hex appendFormat:@"%02x", bytes[index]];
  }

  self.deviceToken = hex;
  [self emit:kEventToken payload:@{@"token" : hex, @"service" : @"apns"}];
}

- (void)didFailToRegisterForRemoteNotificationsWithError:(NSError *)error {
  // Not an error worth raising to JavaScript: no APNs is a normal state on a
  // simulator without a paired Mac, and on a device that is offline at launch.
  // `getDeviceToken` reports nil, which is the documented outcome.
  self.deviceToken = nil;
}

#pragma mark - UNUserNotificationCenterDelegate

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler {
  [self emit:kEventReceived payload:[self payloadForNotification:notification]];

  // Present nothing. A system banner dropping over the screen the user is
  // actively looking at is worse than whatever in-app treatment the app would
  // design, and `onNotificationReceived` is where that treatment belongs. An
  // app that disagrees can install its own delegate before this one and return
  // options of its own — the chain below leaves that open.
  if ([self.previousDelegate respondsToSelector:@selector(userNotificationCenter:
                                                    willPresentNotification:withCompletionHandler:)]) {
    [self.previousDelegate userNotificationCenter:center
                          willPresentNotification:notification
                            withCompletionHandler:completionHandler];
    return;
  }
  completionHandler(UNNotificationPresentationOptionNone);
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
    didReceiveNotificationResponse:(UNNotificationResponse *)response
             withCompletionHandler:(void (^)(void))completionHandler {
  NSMutableDictionary *payload = [NSMutableDictionary dictionary];
  payload[@"notification"] = [self payloadForNotification:response.notification];
  payload[@"action"] = [response.actionIdentifier isEqualToString:UNNotificationDefaultActionIdentifier]
                           ? @"default"
                           : response.actionIdentifier;
  if ([response isKindOfClass:UNTextInputNotificationResponse.class]) {
    payload[@"text"] = ((UNTextInputNotificationResponse *)response).userText;
  }

  [self emitResponse:payload];

  if ([self.previousDelegate respondsToSelector:@selector(userNotificationCenter:
                                                    didReceiveNotificationResponse:withCompletionHandler:)]) {
    [self.previousDelegate userNotificationCenter:center
                   didReceiveNotificationResponse:response
                            withCompletionHandler:completionHandler];
    return;
  }
  completionHandler();
}

#pragma mark - Payloads

- (NSDictionary *)payloadForNotification:(UNNotification *)notification {
  UNNotificationContent *content = notification.request.content;
  NSDictionary *userInfo = content.userInfo ?: @{};
  // `aps` is APNs' own envelope rather than anything the app sent, so it is
  // stripped: leaving it in would mean every consumer had to know to ignore it.
  NSMutableDictionary *data = [userInfo mutableCopy];
  [data removeObjectForKey:@"aps"];

  return @{
    @"id" : notification.request.identifier ?: @"",
    @"title" : content.title ?: @"",
    @"body" : content.body ?: @"",
    @"data" : data,
    @"deliveredAt" : @([notification.date timeIntervalSince1970] * 1000),
    @"remote" : @(userInfo[@"aps"] != nil),
  };
}

@end
