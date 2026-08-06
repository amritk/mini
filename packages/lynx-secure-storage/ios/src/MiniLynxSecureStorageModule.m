#import "MiniLynxSecureStorageModule.h"

#import <Lynx/LynxContext.h>

#import "MiniLynxSecureStorageKeychain.h"

/**
 * The queue every Keychain call runs on.
 *
 * Serial, for the reason the Android half uses a single-thread executor: the
 * first-run check and the write path must not interleave, and two operations
 * racing on the same account is a pair of `SecItemUpdate`s with an undefined
 * winner. Off the main queue because `SecItem*` is synchronous and the first
 * call after a boot can wait on the keybag — and Lynx's calling thread is one
 * it wants back.
 */
static dispatch_queue_t MiniLynxSecureStorageQueue(void) {
  static dispatch_queue_t queue = nil;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    queue = dispatch_queue_create("dev.amritk.minilynx.securestorage", DISPATCH_QUEUE_SERIAL);
  });
  return queue;
}

/** A key that did not arrive as a string. Typed callers cannot produce one; casts can. */
static NSDictionary *MiniLynxSecureStorageMissingKey(void) {
  return @{
    @"ok" : @NO,
    @"error" : MiniLynxSecureStorageErrorUnavailable,
    @"message" : @"a key is required",
  };
}

@implementation MiniLynxSecureStorageModule

+ (NSString *)name {
  return @"MiniLynxSecureStorageModule";
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
    @"getSecureItem" : NSStringFromSelector(@selector(getSecureItem:callback:)),
    @"setSecureItem" : NSStringFromSelector(@selector(setSecureItem:value:options:callback:)),
    @"removeSecureItem" : NSStringFromSelector(@selector(removeSecureItem:callback:)),
    @"hasSecureItem" : NSStringFromSelector(@selector(hasSecureItem:callback:)),
    @"clearSecureStorage" : NSStringFromSelector(@selector(clearSecureStorage:)),
    @"isSecureStorageAvailable" : NSStringFromSelector(@selector(isSecureStorageAvailable:)),
  };
}

/**
 * The context is required by the protocol and unused by this module.
 *
 * `@amritk/lynx-location` keeps its context to publish events through; nothing
 * here publishes anything, because nothing outside this app ever writes to this
 * store. Conforming to `LynxContextModule` anyway keeps registration identical
 * to the other modules in this repository.
 */
- (instancetype)initWithLynxContext:(LynxContext *)context {
  self = [super init];
  return self;
}

#pragma mark - Reading

- (void)getSecureItem:(NSString *)key callback:(void (^)(id))callback {
  if (![key isKindOfClass:NSString.class]) {
    callback(MiniLynxSecureStorageMissingKey());
    return;
  }
  dispatch_async(MiniLynxSecureStorageQueue(), ^{
    callback([MiniLynxSecureStorageKeychain read:key]);
  });
}

- (void)hasSecureItem:(NSString *)key callback:(void (^)(id))callback {
  if (![key isKindOfClass:NSString.class]) {
    callback(MiniLynxSecureStorageMissingKey());
    return;
  }
  dispatch_async(MiniLynxSecureStorageQueue(), ^{
    callback([MiniLynxSecureStorageKeychain contains:key]);
  });
}

#pragma mark - Writing

- (void)setSecureItem:(NSString *)key
                value:(NSString *)value
              options:(NSDictionary *)options
             callback:(void (^)(id))callback {
  if (![key isKindOfClass:NSString.class] || ![value isKindOfClass:NSString.class]) {
    callback(MiniLynxSecureStorageMissingKey());
    return;
  }
  // Read on the calling thread and captured by value: an options bag belongs to
  // the bridge once this method returns, and reaching into it from the queue
  // below is reading whatever the next call put there.
  id requested = [options isKindOfClass:NSDictionary.class] ? options[@"accessibility"] : nil;
  NSString *accessibility = [requested isKindOfClass:NSString.class] ? (NSString *)requested : nil;

  dispatch_async(MiniLynxSecureStorageQueue(), ^{
    callback([MiniLynxSecureStorageKeychain write:key value:value accessibility:accessibility]);
  });
}

- (void)removeSecureItem:(NSString *)key callback:(void (^)(id))callback {
  if (![key isKindOfClass:NSString.class]) {
    callback(MiniLynxSecureStorageMissingKey());
    return;
  }
  dispatch_async(MiniLynxSecureStorageQueue(), ^{
    callback([MiniLynxSecureStorageKeychain remove:key]);
  });
}

- (void)clearSecureStorage:(void (^)(id))callback {
  dispatch_async(MiniLynxSecureStorageQueue(), ^{
    callback([MiniLynxSecureStorageKeychain clear]);
  });
}

#pragma mark - Availability

- (void)isSecureStorageAvailable:(void (^)(id))callback {
  dispatch_async(MiniLynxSecureStorageQueue(), ^{
    // A bare boolean rather than a result union: there is no second thing to
    // say about it, and every other method reports why through its own result.
    callback(@([MiniLynxSecureStorageKeychain isAvailable]));
  });
}

@end
