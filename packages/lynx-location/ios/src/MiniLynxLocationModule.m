#import "MiniLynxLocationModule.h"

#import <Lynx/LynxContext.h>

#import "MiniLynxLocationCenter.h"

@interface MiniLynxLocationModule ()
@property(nonatomic, weak) LynxContext *context;
@end

@implementation MiniLynxLocationModule

+ (NSString *)name {
  return @"MiniLynxLocationModule";
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
    @"isLocationEnabled" : NSStringFromSelector(@selector(isLocationEnabled:)),
    @"getCurrentPosition" : NSStringFromSelector(@selector(getCurrentPosition:callback:)),
    @"getLastKnownPosition" : NSStringFromSelector(@selector(getLastKnownPosition:)),
    @"startWatching" : NSStringFromSelector(@selector(startWatching:callback:)),
    @"stopWatching" : NSStringFromSelector(@selector(stopWatching:)),
    @"reverseGeocode" : NSStringFromSelector(@selector(reverseGeocode:callback:)),
  };
}

- (instancetype)initWithLynxContext:(LynxContext *)context {
  if (self = [super init]) {
    _context = context;
    [MiniLynxLocationCenter.shared registerContext:context];
  }
  return self;
}

- (void)dealloc {
  if (_context) [MiniLynxLocationCenter.shared unregisterContext:_context];
}

#pragma mark - Permission

- (void)getPermissionStatus:(void (^)(id))callback {
  callback(MiniLynxLocationCenter.shared.permissionStatus);
}

- (void)requestPermission:(NSDictionary *)request callback:(void (^)(id))callback {
  // Defaults to precise, matching `LocationPermissionRequest`. The value only
  // reaches Android — see the Center — but it is read here so the two halves
  // agree on the shape of what crosses.
  BOOL precise = ![request[@"precise"] isEqual:@NO];
  [MiniLynxLocationCenter.shared requestPermissionPrecise:precise
                                               completion:^(NSString *status) {
                                                 callback(status);
                                               }];
}

#pragma mark - Reading

- (void)isLocationEnabled:(void (^)(id))callback {
  callback(@(MiniLynxLocationCenter.shared.isLocationEnabled));
}

- (void)getLastKnownPosition:(void (^)(id))callback {
  NSDictionary *position = MiniLynxLocationCenter.shared.lastKnownPosition;
  // No fix is a null rather than an omission: `getLastKnownPosition` is typed
  // `LocationFix | null` and an absent argument would arrive as `undefined`.
  callback(position ?: NSNull.null);
}

- (void)getCurrentPosition:(NSDictionary *)options callback:(void (^)(id))callback {
  NSString *accuracy = [options[@"accuracy"] isKindOfClass:NSString.class] ? options[@"accuracy"] : @"balanced";
  // Milliseconds on the wire, seconds in CoreLocation.
  NSTimeInterval timeout = [options[@"timeout"] doubleValue] / 1000.0;
  NSTimeInterval maximumAge = [options[@"maximumAge"] doubleValue] / 1000.0;

  [MiniLynxLocationCenter.shared currentPositionWithAccuracy:accuracy
                                                     timeout:timeout
                                                  maximumAge:maximumAge
                                                  completion:^(NSDictionary *result) {
                                                    callback(result);
                                                  }];
}

#pragma mark - Watching

- (void)startWatching:(NSDictionary *)options callback:(void (^)(id))callback {
  NSString *accuracy = [options[@"accuracy"] isKindOfClass:NSString.class] ? options[@"accuracy"] : @"balanced";
  CLLocationDistance distanceFilter = [options[@"distanceFilter"] doubleValue];

  // `interval` is deliberately dropped. It is Android's minimum time between
  // updates and CoreLocation has no equivalent — `WatchOptions` says so rather
  // than pretending the two platforms pace alike.
  callback([MiniLynxLocationCenter.shared startWatchingWithAccuracy:accuracy distanceFilter:distanceFilter]);
}

- (void)stopWatching:(NSString *)watchId {
  [MiniLynxLocationCenter.shared stopWatching:watchId];
}

#pragma mark - Reverse geocoding

/**
 * Coordinates in, addresses out.
 *
 * **No permission check, deliberately.** This never reads the device's own
 * location, so an app that has been refused location outright can still label a
 * saved venue. A check here to make this look like the methods above would push
 * consumers into requesting a permission they have no use for.
 */
- (void)reverseGeocode:(NSDictionary *)request callback:(void (^)(id))callback {
  // The coordinates arrive in the same bag as the options — one map on the
  // wire, so a new option later is a key rather than a signature change in
  // three languages. A missing key reads as 0 through `doubleValue`, which is a
  // real coordinate in the Gulf of Guinea, so their presence is checked rather
  // than assumed.
  id latitude = request[@"latitude"];
  id longitude = request[@"longitude"];
  if (![latitude isKindOfClass:NSNumber.class] || ![longitude isKindOfClass:NSNumber.class]) {
    callback(@{
      @"ok" : @NO,
      @"error" : MiniLynxLocationErrorInvalidCoordinates,
      @"message" : @"latitude and longitude are required",
    });
    return;
  }

  NSString *locale = [request[@"locale"] isKindOfClass:NSString.class] ? request[@"locale"] : nil;
  // Floored at one so that an explicit zero cannot ask for an answer that could
  // only be read as `notFound`. Matches the Kotlin half.
  NSUInteger maxResults = MAX([request[@"maxResults"] unsignedIntegerValue], (NSUInteger)1);

  [MiniLynxLocationCenter.shared reverseGeocodeLatitude:[latitude doubleValue]
                                              longitude:[longitude doubleValue]
                                                 locale:locale
                                             maxResults:maxResults
                                             completion:^(NSDictionary *result) {
                                               callback(result);
                                             }];
}

@end
