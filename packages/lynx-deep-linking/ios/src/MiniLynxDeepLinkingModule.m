#import "MiniLynxDeepLinkingModule.h"

#import <Lynx/LynxContext.h>

#import "MiniLynxDeepLinkingCenter.h"

@interface MiniLynxDeepLinkingModule ()
@property(nonatomic, weak) LynxContext *context;
@end

@implementation MiniLynxDeepLinkingModule

+ (NSString *)name {
  return @"MiniLynxDeepLinkingModule";
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
    @"getInitialURL" : NSStringFromSelector(@selector(getInitialURL:)),
    @"flushPendingLink" : NSStringFromSelector(@selector(flushPendingLink)),
    @"openURL" : NSStringFromSelector(@selector(openURL:callback:)),
    @"canOpenURL" : NSStringFromSelector(@selector(canOpenURL:callback:)),
    @"openSettings" : NSStringFromSelector(@selector(openSettings:)),
  };
}

- (instancetype)initWithLynxContext:(LynxContext *)context {
  if (self = [super init]) {
    _context = context;
    [MiniLynxDeepLinkingCenter.shared registerContext:context];
  }
  return self;
}

- (void)dealloc {
  if (_context) [MiniLynxDeepLinkingCenter.shared unregisterContext:_context];
}

#pragma mark - Inbound

- (void)getInitialURL:(void (^)(id))callback {
  NSString *url = MiniLynxDeepLinkingCenter.shared.initialURL;
  // No launch URL is a null rather than an omission: `getInitialURL` is typed
  // `string | null` and an absent argument would arrive as `undefined`.
  callback(url ?: NSNull.null);
}

- (void)flushPendingLink {
  [MiniLynxDeepLinkingCenter.shared flushPendingLink];
}

#pragma mark - Outbound

- (void)openURL:(NSString *)url callback:(void (^)(id))callback {
  [MiniLynxDeepLinkingCenter.shared openURL:url
                                 completion:^(NSDictionary *result) {
                                   callback(result);
                                 }];
}

- (void)canOpenURL:(NSString *)url callback:(void (^)(id))callback {
  [MiniLynxDeepLinkingCenter.shared canOpenURL:url
                                    completion:^(BOOL canOpen) {
                                      callback(@(canOpen));
                                    }];
}

- (void)openSettings:(void (^)(id))callback {
  [MiniLynxDeepLinkingCenter.shared openSettingsWithCompletion:^(BOOL opened) {
    callback(@(opened));
  }];
}

@end
