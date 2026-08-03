#import <CoreLocation/CoreLocation.h>
#import <Foundation/Foundation.h>

@class LynxContext;

NS_ASSUME_NONNULL_BEGIN

/**
 * The failure codes that cross to JavaScript, as `LocationErrorCode` spells
 * them.
 *
 * Constants rather than literals at the call sites because a typo in one is a
 * branch on the other side that silently never runs, and no compiler on either
 * side can see it. `src/native-contract.test.ts` reads the implementation file
 * to check that Kotlin and Objective-C know every one of them.
 */
extern NSString *const MiniLynxLocationErrorPermissionDenied;
extern NSString *const MiniLynxLocationErrorLocationDisabled;
extern NSString *const MiniLynxLocationErrorTimeout;
extern NSString *const MiniLynxLocationErrorUnavailable;

/**
 * The codes a reverse geocode can end in, as `GeocodeErrorCode` spells them.
 *
 * `MiniLynxLocationErrorUnavailable` above is shared between the two unions
 * deliberately: on both halves of this package it means "this device cannot do
 * that", and a second spelling would be two branches for one outcome.
 */
extern NSString *const MiniLynxLocationErrorInvalidCoordinates;
extern NSString *const MiniLynxLocationErrorNotFound;
extern NSString *const MiniLynxLocationErrorNetwork;

/**
 * The process-wide half of the iOS implementation: every `CLLocationManager`,
 * the permission prompt, and the fan-out to every live LynxContext.
 *
 * It is a singleton because a `CLLocationManager` has to outlive the call that
 * created it — CoreLocation answers through a delegate, and a manager released
 * at the end of the method that made it is a delegate callback that never
 * arrives. That is the single most common way an iOS location integration
 * fails, and it fails silently.
 */
@interface MiniLynxLocationCenter : NSObject <CLLocationManagerDelegate>

@property(class, nonatomic, readonly) MiniLynxLocationCenter *shared;

/** Registers a context so events reach the LynxView it belongs to. */
- (void)registerContext:(LynxContext *)context;
- (void)unregisterContext:(LynxContext *)context;

/** The current authorisation, as one of the states the TypeScript declares. */
- (NSString *)permissionStatus;

/** Prompts for `WhenInUse`, or answers immediately when there is nothing to ask. */
- (void)requestPermissionPrecise:(BOOL)precise completion:(void (^)(NSString *status))completion;

/** Whether location services are switched on device-wide. */
- (BOOL)isLocationEnabled;

/** The fix CoreLocation already has, or nil. */
- (nullable NSDictionary *)lastKnownPosition;

/** One fix, or one `LocationResult` failure, and then done. */
- (void)currentPositionWithAccuracy:(NSString *)accuracy
                            timeout:(NSTimeInterval)timeout
                         maximumAge:(NSTimeInterval)maximumAge
                         completion:(void (^)(NSDictionary *result))completion;

/** Starts a watch and returns the id its events are published under. */
- (NSString *)startWatchingWithAccuracy:(NSString *)accuracy distanceFilter:(CLLocationDistance)distanceFilter;

/** Stops a watch. Unknown ids are ignored. */
- (void)stopWatching:(NSString *)watchId;

/**
 * One reverse geocode, and then done.
 *
 * Takes no permission of any kind: this reads no device location, only the
 * coordinates it is handed.
 *
 * `maxResults` is a ceiling applied here rather than passed on — CoreLocation
 * has no equivalent parameter and returns as many placemarks as it found.
 */
- (void)reverseGeocodeLatitude:(CLLocationDegrees)latitude
                     longitude:(CLLocationDegrees)longitude
                        locale:(nullable NSString *)locale
                    maxResults:(NSUInteger)maxResults
                    completion:(void (^)(NSDictionary *result))completion;

@end

NS_ASSUME_NONNULL_END
