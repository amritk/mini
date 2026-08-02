#import "MiniLynxNotificationsModule.h"

#import <Lynx/LynxContext.h>
#import <UIKit/UIKit.h>
#import <UserNotifications/UserNotifications.h>

#import "MiniLynxNotificationsCenter.h"

@interface MiniLynxNotificationsModule ()
@property(nonatomic, weak) LynxContext *context;
@end

@implementation MiniLynxNotificationsModule

+ (NSString *)name {
  return @"MiniLynxNotificationsModule";
}

/**
 * The JavaScript-name-to-selector table Lynx dispatches through.
 *
 * It is hand-written and therefore hand-checked: a name here that no selector
 * below implements fails at call time rather than at build time, and a selector
 * whose arity does not match what JavaScript passes fails the same way. Adding
 * a method means editing this table and the TypeScript facade together.
 */
+ (NSDictionary<NSString *, NSString *> *)methodLookup {
  return @{
    @"getPermissionStatus" : NSStringFromSelector(@selector(getPermissionStatus:)),
    @"requestPermission" : NSStringFromSelector(@selector(requestPermission:callback:)),
    @"getDeviceToken" : NSStringFromSelector(@selector(getDeviceToken:)),
    @"scheduleNotification" : NSStringFromSelector(@selector(scheduleNotification:callback:)),
    @"cancelNotification" : NSStringFromSelector(@selector(cancelNotification:)),
    @"cancelAllNotifications" : NSStringFromSelector(@selector(cancelAllNotifications)),
    @"getScheduledNotifications" : NSStringFromSelector(@selector(getScheduledNotifications:)),
    @"getBadgeCount" : NSStringFromSelector(@selector(getBadgeCount:)),
    @"setBadgeCount" : NSStringFromSelector(@selector(setBadgeCount:)),
    @"createNotificationChannel" : NSStringFromSelector(@selector(createNotificationChannel:)),
    @"flushPendingResponse" : NSStringFromSelector(@selector(flushPendingResponse)),
  };
}

- (instancetype)initWithLynxContext:(LynxContext *)context {
  if (self = [super init]) {
    _context = context;
    [MiniLynxNotificationsCenter.shared registerContext:context];
    // Taking the delegate slot is deferred to here rather than done at load
    // time, so a process that never uses notifications never has its delegate
    // replaced.
    [MiniLynxNotificationsCenter.shared install];
  }
  return self;
}

- (void)dealloc {
  if (_context) [MiniLynxNotificationsCenter.shared unregisterContext:_context];
}

#pragma mark - Permission

- (void)getPermissionStatus:(void (^)(id))callback {
  [UNUserNotificationCenter.currentNotificationCenter
      getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
        callback([self statusFromSettings:settings]);
      }];
}

- (void)requestPermission:(NSDictionary *)request callback:(void (^)(id))callback {
  [UNUserNotificationCenter.currentNotificationCenter
      getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
        // iOS shows its prompt once per install. Asking again after an answer
        // displays nothing and reports the standing answer, so short-circuiting
        // here is both the truth and what would happen anyway.
        if (settings.authorizationStatus != UNAuthorizationStatusNotDetermined) {
          callback([self statusFromSettings:settings]);
          return;
        }

        UNAuthorizationOptions options = 0;
        if (![request[@"alert"] isEqual:@NO]) options |= UNAuthorizationOptionAlert;
        if (![request[@"badge"] isEqual:@NO]) options |= UNAuthorizationOptionBadge;
        if (![request[@"sound"] isEqual:@NO]) options |= UNAuthorizationOptionSound;
        if ([request[@"provisional"] isEqual:@YES]) {
          options |= UNAuthorizationOptionProvisional;
        }

        [UNUserNotificationCenter.currentNotificationCenter
            requestAuthorizationWithOptions:options
                          completionHandler:^(BOOL granted, NSError *_Nullable error) {
                            if (!granted || error != nil) {
                              callback(@"denied");
                              return;
                            }
                            // Registering for remote push is what causes APNs
                            // to issue a token, and it must happen on the main
                            // thread. Harmless for an app that only schedules
                            // local notifications: with no APNs entitlement it
                            // fails quietly and `getDeviceToken` reports nil.
                            dispatch_async(dispatch_get_main_queue(), ^{
                              [UIApplication.sharedApplication registerForRemoteNotifications];
                            });
                            callback([request[@"provisional"] isEqual:@YES] ? @"provisional"
                                                                            : @"granted");
                          }];
      }];
}

- (NSString *)statusFromSettings:(UNNotificationSettings *)settings {
  switch (settings.authorizationStatus) {
    case UNAuthorizationStatusAuthorized:
      return @"granted";
    case UNAuthorizationStatusProvisional:
      return @"provisional";
    case UNAuthorizationStatusDenied:
      return @"denied";
    default:
      return @"undetermined";
  }
}

#pragma mark - Remote push

- (void)getDeviceToken:(void (^)(id))callback {
  NSString *token = MiniLynxNotificationsCenter.shared.deviceToken;
  if (token != nil) {
    callback(@{@"token" : token, @"service" : @"apns"});
    return;
  }
  // No token yet. Kick registration off so one arrives on `onDeviceToken`, and
  // answer nil rather than waiting — the wait could be indefinite offline.
  dispatch_async(dispatch_get_main_queue(), ^{
    [UIApplication.sharedApplication registerForRemoteNotifications];
  });
  callback([NSNull null]);
}

#pragma mark - Scheduling

- (void)scheduleNotification:(NSDictionary *)request callback:(void (^)(id))callback {
  NSString *identifier = request[@"id"] ?: NSUUID.UUID.UUIDString;

  UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
  content.title = request[@"title"] ?: @"";
  if (request[@"body"] != nil) content.body = request[@"body"];
  content.userInfo = request[@"data"] ?: @{};
  if (![request[@"sound"] isEqual:@NO]) content.sound = UNNotificationSound.defaultSound;
  if (request[@"badge"] != nil) content.badge = request[@"badge"];

  UNNotificationTrigger *trigger = [self triggerFrom:request[@"trigger"]];

  // A nil trigger means "deliver now" to UNUserNotificationCenter, which is
  // exactly what the JavaScript side means by omitting one.
  UNNotificationRequest *notification =
      [UNNotificationRequest requestWithIdentifier:identifier content:content trigger:trigger];

  [UNUserNotificationCenter.currentNotificationCenter
      addNotificationRequest:notification
       withCompletionHandler:^(NSError *_Nullable error) {
         callback(identifier);
       }];
}

- (nullable UNNotificationTrigger *)triggerFrom:(nullable NSDictionary *)trigger {
  if (trigger == nil) return nil;
  NSString *type = trigger[@"type"];

  if ([type isEqualToString:@"timeInterval"]) {
    double seconds = [trigger[@"seconds"] doubleValue];
    BOOL repeats = [trigger[@"repeats"] isEqual:@YES];
    // UNTimeIntervalNotificationTrigger throws below 60 seconds when repeating,
    // and rejects a non-positive interval outright. Clamping is friendlier than
    // an exception from inside a scheduling call.
    if (repeats && seconds < 60) seconds = 60;
    if (seconds <= 0) return nil;
    return [UNTimeIntervalNotificationTrigger triggerWithTimeInterval:seconds repeats:repeats];
  }

  if ([type isEqualToString:@"date"]) {
    double timestamp = [trigger[@"timestamp"] doubleValue] / 1000.0;
    NSDate *date = [NSDate dateWithTimeIntervalSince1970:timestamp];
    NSDateComponents *components =
        [NSCalendar.currentCalendar components:NSCalendarUnitYear | NSCalendarUnitMonth |
                                               NSCalendarUnitDay | NSCalendarUnitHour |
                                               NSCalendarUnitMinute | NSCalendarUnitSecond
                                      fromDate:date];
    return [UNCalendarNotificationTrigger triggerWithDateMatchingComponents:components repeats:NO];
  }

  return nil;
}

- (void)cancelNotification:(NSString *)identifier {
  NSArray<NSString *> *identifiers = @[ identifier ];
  [UNUserNotificationCenter.currentNotificationCenter
      removePendingNotificationRequestsWithIdentifiers:identifiers];
  // Also clear an already-delivered copy, so a notification the app considers
  // cancelled is not still sitting in the notification centre.
  [UNUserNotificationCenter.currentNotificationCenter
      removeDeliveredNotificationsWithIdentifiers:identifiers];
}

- (void)cancelAllNotifications {
  [UNUserNotificationCenter.currentNotificationCenter removeAllPendingNotificationRequests];
  [UNUserNotificationCenter.currentNotificationCenter removeAllDeliveredNotifications];
}

- (void)getScheduledNotifications:(void (^)(id))callback {
  [UNUserNotificationCenter.currentNotificationCenter
      getPendingNotificationRequestsWithCompletionHandler:^(
          NSArray<UNNotificationRequest *> *requests) {
        NSMutableArray *scheduled = [NSMutableArray arrayWithCapacity:requests.count];
        for (UNNotificationRequest *request in requests) {
          NSMutableDictionary *entry = [NSMutableDictionary dictionary];
          entry[@"id"] = request.identifier;
          entry[@"title"] = request.content.title ?: @"";
          entry[@"body"] = request.content.body ?: @"";
          entry[@"data"] = request.content.userInfo ?: @{};
          NSDictionary *trigger = [self describeTrigger:request.trigger];
          if (trigger != nil) entry[@"trigger"] = trigger;
          [scheduled addObject:entry];
        }
        callback(scheduled);
      }];
}

- (nullable NSDictionary *)describeTrigger:(nullable UNNotificationTrigger *)trigger {
  if ([trigger isKindOfClass:UNTimeIntervalNotificationTrigger.class]) {
    UNTimeIntervalNotificationTrigger *interval = (UNTimeIntervalNotificationTrigger *)trigger;
    return @{
      @"type" : @"timeInterval",
      @"seconds" : @(interval.timeInterval),
      @"repeats" : @(interval.repeats),
    };
  }
  if ([trigger isKindOfClass:UNCalendarNotificationTrigger.class]) {
    UNCalendarNotificationTrigger *calendar = (UNCalendarNotificationTrigger *)trigger;
    NSDate *next = calendar.nextTriggerDate;
    if (next == nil) return nil;
    return @{@"type" : @"date", @"timestamp" : @([next timeIntervalSince1970] * 1000)};
  }
  return nil;
}

#pragma mark - Badge

- (void)getBadgeCount:(void (^)(id))callback {
  // There is no reader on UNUserNotificationCenter — iOS 16 added
  // `setBadgeCount:` but no getter — so this stays on UIApplication on every
  // version, and that is a main-thread API.
  dispatch_async(dispatch_get_main_queue(), ^{
    callback(@(UIApplication.sharedApplication.applicationIconBadgeNumber));
  });
}

- (void)setBadgeCount:(double)count {
  if (@available(iOS 16.0, *)) {
    [UNUserNotificationCenter.currentNotificationCenter setBadgeCount:(NSInteger)count
                                               withCompletionHandler:nil];
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    UIApplication.sharedApplication.applicationIconBadgeNumber = (NSInteger)count;
  });
}

#pragma mark - Channels

- (void)createNotificationChannel:(NSDictionary *)channel {
  // Android-only. Declared so the JavaScript side can call it unconditionally
  // at startup rather than branching on platform — the alternative is every app
  // writing the same check.
}

#pragma mark - Cold start

- (void)flushPendingResponse {
  [MiniLynxNotificationsCenter.shared flushPendingResponse];
}

@end
