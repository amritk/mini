#import "MiniLynxLocationCenter.h"

#import <Lynx/LynxContext.h>

NSString *const MiniLynxLocationErrorPermissionDenied = @"permissionDenied";
NSString *const MiniLynxLocationErrorLocationDisabled = @"locationDisabled";
NSString *const MiniLynxLocationErrorTimeout = @"timeout";
NSString *const MiniLynxLocationErrorUnavailable = @"unavailable";

static NSString *const kEventPosition = @"mini-lynx:location:position";
static NSString *const kEventError = @"mini-lynx:location:error";

/** The default when a caller passes no `timeout`. Mirrors the Android half. */
static const NSTimeInterval kDefaultTimeout = 15.0;

/**
 * One outstanding `getCurrentPosition`.
 *
 * The manager, the completion and the timer have to be held together and
 * released together: three things race to answer (a fix, a failure and the
 * timeout), exactly one of them may call the completion, and whichever wins has
 * to tear down the other two.
 */
@interface MiniLynxPendingFix : NSObject
@property(nonatomic, strong) CLLocationManager *manager;
@property(nonatomic, copy) void (^completion)(NSDictionary *);
@property(nonatomic, strong, nullable) NSTimer *timer;
@end

@implementation MiniLynxPendingFix
@end

@interface MiniLynxLocationCenter ()
@property(nonatomic, strong) NSHashTable<LynxContext *> *contexts;
/** Outstanding one-shot requests, keyed by the manager that serves each. */
@property(nonatomic, strong) NSMapTable<CLLocationManager *, MiniLynxPendingFix *> *pendingFixes;
/** Running watches, keyed by their JavaScript-visible id. */
@property(nonatomic, strong) NSMutableDictionary<NSString *, CLLocationManager *> *watches;
/** Held only for the duration of a permission prompt — CoreLocation answers through the delegate. */
@property(nonatomic, strong, nullable) CLLocationManager *permissionManager;
@property(nonatomic, copy, nullable) void (^permissionCompletion)(NSString *);
@property(nonatomic, assign) NSUInteger nextWatch;
@end

@implementation MiniLynxLocationCenter

+ (MiniLynxLocationCenter *)shared {
  static MiniLynxLocationCenter *shared = nil;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    shared = [[MiniLynxLocationCenter alloc] init];
  });
  return shared;
}

- (instancetype)init {
  if (self = [super init]) {
    // Weak, because a context belongs to a LynxView and outliving it here would
    // keep a whole view tree alive for as long as the process runs.
    _contexts = [NSHashTable weakObjectsHashTable];
    // The key is weak and the value strong: the manager is kept alive by the
    // watches dictionary or by the pending fix itself, and this table exists
    // only to map a delegate callback back to what asked for it.
    _pendingFixes = [NSMapTable mapTableWithKeyOptions:NSPointerFunctionsWeakMemory
                                          valueOptions:NSPointerFunctionsStrongMemory];
    _watches = [NSMutableDictionary dictionary];
    _nextWatch = 0;
  }
  return self;
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

- (void)emit:(NSString *)name payload:(NSDictionary *)payload {
  NSArray<LynxContext *> *targets;
  @synchronized(self) {
    targets = self.contexts.allObjects;
  }
  for (LynxContext *context in targets) {
    [context sendGlobalEvent:name withParams:@[ payload ]];
  }
}

#pragma mark - Permission

- (CLAuthorizationStatus)authorizationStatus {
  if (@available(iOS 14.0, *)) {
    // The class method was deprecated in 14 in favour of this one, which needs
    // a manager to ask. Making one is cheap and does not start anything.
    static CLLocationManager *prober = nil;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
      prober = [[CLLocationManager alloc] init];
    });
    return prober.authorizationStatus;
  }
  return CLLocationManager.authorizationStatus;
}

- (NSString *)permissionStatus {
  switch ([self authorizationStatus]) {
    case kCLAuthorizationStatusAuthorizedWhenInUse:
    case kCLAuthorizationStatusAuthorizedAlways:
      return @"granted";
    case kCLAuthorizationStatusDenied:
      return @"denied";
    // Off by parental controls or an MDM profile. The user cannot grant it, so
    // an app that offers them a settings link is offering a dead end — which is
    // why this is not folded into `denied`.
    case kCLAuthorizationStatusRestricted:
      return @"restricted";
    default:
      return @"undetermined";
  }
}

- (void)requestPermissionPrecise:(BOOL)precise completion:(void (^)(NSString *))completion {
  NSString *status = [self permissionStatus];
  // iOS shows its prompt once per install. Asking again after an answer
  // displays nothing and reports the standing answer, so short-circuiting here
  // is both the truth and what would happen anyway.
  if (![status isEqualToString:@"undetermined"]) {
    completion(status);
    return;
  }

  // `precise` is deliberately unused on this platform. iOS puts one
  // precise/approximate toggle inside the single WhenInUse prompt and the user
  // owns it, so there is nothing here to request — `LocationPermissionRequest`
  // says so.
  (void)precise;

  dispatch_async(dispatch_get_main_queue(), ^{
    @synchronized(self) {
      // The manager is a property rather than a local: CoreLocation answers
      // through `locationManagerDidChangeAuthorization:`, and a manager
      // released at the end of this block is a prompt whose answer never
      // arrives.
      self.permissionManager = [[CLLocationManager alloc] init];
      self.permissionManager.delegate = self;
      self.permissionCompletion = completion;
    }
    [self.permissionManager requestWhenInUseAuthorization];
  });
}

- (void)settlePermission {
  void (^completion)(NSString *);
  @synchronized(self) {
    completion = self.permissionCompletion;
    self.permissionCompletion = nil;
    self.permissionManager = nil;
  }
  if (completion != nil) completion([self permissionStatus]);
}

- (void)locationManagerDidChangeAuthorization:(CLLocationManager *)manager API_AVAILABLE(ios(14.0)) {
  [self settlePermission];
}

// iOS 13's spelling of the same callback. Deprecated in 14 and never called
// there, but this pod deploys to 13 and on those devices it is the only one.
- (void)locationManager:(CLLocationManager *)manager
    didChangeAuthorizationStatus:(CLAuthorizationStatus)status {
  if (status == kCLAuthorizationStatusNotDetermined) return;
  [self settlePermission];
}

#pragma mark - Reading

- (BOOL)isLocationEnabled {
  // Apple warns that this blocks if called on the main thread while the
  // location daemon is busy. Bridge calls arrive on a background thread, which
  // is where this is meant to be asked, so it is deliberately not dispatched.
  return CLLocationManager.locationServicesEnabled;
}

- (CLLocationAccuracy)desiredAccuracyFor:(NSString *)accuracy {
  if ([accuracy isEqualToString:@"high"]) return kCLLocationAccuracyBest;
  if ([accuracy isEqualToString:@"low"]) return kCLLocationAccuracyKilometer;
  return kCLLocationAccuracyHundredMeters;
}

/**
 * One fix as `LocationFix` describes it.
 *
 * CoreLocation reports "unknown" as a negative accuracy and as a negative
 * speed or course, rather than as a missing value — so every one of those is
 * turned into an explicit null here. Passing -1 through as a number would give
 * JavaScript a heading of minus one degree, which is a plausible-looking value
 * and wrong.
 */
- (NSDictionary *)payloadFor:(CLLocation *)location {
  id (^orNull)(double) = ^id(double value) {
    return value < 0 ? (id)NSNull.null : (id)@(value);
  };

  return @{
    @"latitude" : @(location.coordinate.latitude),
    @"longitude" : @(location.coordinate.longitude),
    @"accuracy" : orNull(location.horizontalAccuracy),
    // Altitude is signed and a negative one is meaningful (below sea level), so
    // its validity is carried by the vertical accuracy instead.
    @"altitude" : location.verticalAccuracy < 0 ? (id)NSNull.null : (id)@(location.altitude),
    @"altitudeAccuracy" : orNull(location.verticalAccuracy),
    @"speed" : orNull(location.speed),
    // Course over ground, so a stationary device reports -1 and gets a null.
    @"heading" : orNull(location.course),
    @"timestamp" : @(location.timestamp.timeIntervalSince1970 * 1000.0),
  };
}

- (nullable NSDictionary *)lastKnownPosition {
  if (![[self permissionStatus] isEqualToString:@"granted"]) return nil;

  static CLLocationManager *cache = nil;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    cache = [[CLLocationManager alloc] init];
  });
  CLLocation *location = cache.location;
  return location == nil ? nil : [self payloadFor:location];
}

- (NSDictionary *)failure:(NSString *)code message:(NSString *)message {
  return @{@"ok" : @NO, @"error" : code, @"message" : message};
}

- (NSDictionary *)success:(CLLocation *)location {
  return @{@"ok" : @YES, @"position" : [self payloadFor:location]};
}

#pragma mark - One fix

- (void)currentPositionWithAccuracy:(NSString *)accuracy
                            timeout:(NSTimeInterval)timeout
                         maximumAge:(NSTimeInterval)maximumAge
                         completion:(void (^)(NSDictionary *))completion {
  NSString *status = [self permissionStatus];
  if (![status isEqualToString:@"granted"]) {
    completion([self failure:MiniLynxLocationErrorPermissionDenied
                     message:[NSString stringWithFormat:@"location permission is %@", status]]);
    return;
  }
  if (!self.isLocationEnabled) {
    completion([self failure:MiniLynxLocationErrorLocationDisabled message:@"location services are off"]);
    return;
  }

  NSTimeInterval wait = timeout > 0 ? timeout : kDefaultTimeout;

  dispatch_async(dispatch_get_main_queue(), ^{
    CLLocationManager *manager = [[CLLocationManager alloc] init];
    manager.delegate = self;
    manager.desiredAccuracy = [self desiredAccuracyFor:accuracy];

    // Answering from the cache is the difference between an instant map and a
    // three-second one, and it powers nothing up to do it.
    CLLocation *cached = manager.location;
    if (maximumAge > 0 && cached != nil && -cached.timestamp.timeIntervalSinceNow <= maximumAge) {
      completion([self success:cached]);
      return;
    }

    MiniLynxPendingFix *pending = [[MiniLynxPendingFix alloc] init];
    pending.manager = manager;
    pending.completion = completion;

    @synchronized(self) {
      [self.pendingFixes setObject:pending forKey:manager];
    }

    pending.timer = [NSTimer scheduledTimerWithTimeInterval:wait
                                                    repeats:NO
                                                      block:^(NSTimer *timer) {
                                                        [self settleFixFor:manager
                                                                withResult:[self failure:MiniLynxLocationErrorTimeout
                                                                                 message:@"no fix within the timeout"]];
                                                      }];

    [manager requestLocation];
  });
}

/**
 * Answers one outstanding request, at most once.
 *
 * Removing the entry *before* calling the completion is what makes "at most
 * once" true: the timer and the two delegate callbacks all route through here,
 * and on iOS `requestLocation` can deliver a fix and an error in quick
 * succession. Invoking a Lynx callback twice is not recoverable on the other
 * side — the promise it settles is already gone.
 */
- (void)settleFixFor:(CLLocationManager *)manager withResult:(NSDictionary *)result {
  MiniLynxPendingFix *pending;
  @synchronized(self) {
    pending = [self.pendingFixes objectForKey:manager];
    if (pending == nil) return;
    [self.pendingFixes removeObjectForKey:manager];
  }
  [pending.timer invalidate];
  pending.timer = nil;
  pending.manager.delegate = nil;
  pending.completion(result);
}

#pragma mark - Watches

- (NSString *)startWatchingWithAccuracy:(NSString *)accuracy distanceFilter:(CLLocationDistance)distanceFilter {
  NSString *watchId;
  @synchronized(self) {
    watchId = [NSString stringWithFormat:@"watch-%lu", (unsigned long)(++self.nextWatch)];
  }

  NSString *status = [self permissionStatus];
  if (![status isEqualToString:@"granted"]) {
    [self emitError:watchId
               code:MiniLynxLocationErrorPermissionDenied
            message:[NSString stringWithFormat:@"location permission is %@", status]];
    return watchId;
  }
  if (!self.isLocationEnabled) {
    [self emitError:watchId code:MiniLynxLocationErrorLocationDisabled message:@"location services are off"];
    return watchId;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    CLLocationManager *manager = [[CLLocationManager alloc] init];
    manager.delegate = self;
    manager.desiredAccuracy = [self desiredAccuracyFor:accuracy];
    manager.distanceFilter = distanceFilter > 0 ? distanceFilter : kCLDistanceFilterNone;
    @synchronized(self) {
      self.watches[watchId] = manager;
    }
    [manager startUpdatingLocation];
  });

  return watchId;
}

- (void)stopWatching:(NSString *)watchId {
  CLLocationManager *manager;
  @synchronized(self) {
    manager = self.watches[watchId];
    [self.watches removeObjectForKey:watchId];
  }
  if (manager == nil) return;
  dispatch_async(dispatch_get_main_queue(), ^{
    [manager stopUpdatingLocation];
    manager.delegate = nil;
  });
}

/** The watch a delegate callback belongs to, or nil when it was a one-shot request. */
- (nullable NSString *)watchIdFor:(CLLocationManager *)manager {
  @synchronized(self) {
    return [self.watches allKeysForObject:manager].firstObject;
  }
}

- (void)emitError:(NSString *)watchId code:(NSString *)code message:(NSString *)message {
  [self emit:kEventError payload:@{@"watchId" : watchId, @"error" : code, @"message" : message}];
}

#pragma mark - CLLocationManagerDelegate

- (void)locationManager:(CLLocationManager *)manager didUpdateLocations:(NSArray<CLLocation *> *)locations {
  CLLocation *location = locations.lastObject;
  if (location == nil) return;

  NSString *watchId = [self watchIdFor:manager];
  if (watchId != nil) {
    [self emit:kEventPosition payload:@{@"watchId" : watchId, @"position" : [self payloadFor:location]}];
    return;
  }
  [self settleFixFor:manager withResult:[self success:location]];
}

- (void)locationManager:(CLLocationManager *)manager didFailWithError:(NSError *)error {
  NSString *code = MiniLynxLocationErrorUnavailable;
  if (error.code == kCLErrorDenied) code = MiniLynxLocationErrorPermissionDenied;

  NSString *watchId = [self watchIdFor:manager];
  if (watchId != nil) {
    // Reported, not fatal. The watch stays registered because a provider that
    // went away can come back, and tearing it down here would mean the app
    // never sees that recovery.
    [self emitError:watchId code:code message:error.localizedDescription];
    return;
  }
  [self settleFixFor:manager withResult:[self failure:code message:error.localizedDescription]];
}

@end
