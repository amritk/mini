#import "MiniLynxDialogsPresenter.h"

NSString *const MiniLynxDialogReasonDismissed = @"dismissed";
NSString *const MiniLynxDialogReasonBusy = @"busy";
NSString *const MiniLynxDialogReasonUnavailable = @"unavailable";

@interface MiniLynxDialogsPresenter ()

/** The answer the presentation on screen still owes. Nil means the slot is free. */
@property(nonatomic, copy, nullable) void (^completion)(NSDictionary *result);

/** Held weakly: UIKit owns a presented controller, and this only needs to find it again. */
@property(nonatomic, weak, nullable) UIViewController *active;

@end

@implementation MiniLynxDialogsPresenter

+ (MiniLynxDialogsPresenter *)shared {
  static MiniLynxDialogsPresenter *shared = nil;
  static dispatch_once_t token;
  dispatch_once(&token, ^{
    shared = [[MiniLynxDialogsPresenter alloc] init];
  });
  return shared;
}

#pragma mark - The one slot

- (BOOL)beginWithCompletion:(void (^)(NSDictionary *))completion {
  @synchronized(self) {
    if (self.completion != nil) return NO;
    self.completion = completion;
    return YES;
  }
}

- (void)finish:(NSDictionary *)result {
  void (^completion)(NSDictionary *) = nil;
  @synchronized(self) {
    completion = self.completion;
    // Cleared before the callback runs, because a caller may present again the
    // instant its promise settles — and a slot still holding this finished
    // presentation would refuse that one as `busy`.
    self.completion = nil;
    self.active = nil;
  }
  if (completion) completion(result);
}

- (void)cancelWithMessage:(NSString *)message {
  [self finish:[MiniLynxDialogsPresenter failure:MiniLynxDialogReasonDismissed message:message]];
}

#pragma mark - Finding somewhere to present

- (nullable UIViewController *)topViewController {
  UIViewController *top = [self keyWindow].rootViewController;
  // A controller that is on its way out cannot present anything — UIKit refuses
  // and logs, and the promise would never settle. Stopping above it presents
  // from the controller that is about to be back on screen instead.
  while (top.presentedViewController != nil && !top.presentedViewController.isBeingDismissed) {
    top = top.presentedViewController;
  }
  return top;
}

/**
 * The window to present into.
 *
 * `UIApplication.keyWindow` has been deprecated since iOS 13 and lies on a
 * device running more than one scene, so this walks the connected scenes
 * instead and prefers the key window of a foreground-active one. The first
 * visible window of any scene is the fallback, because a host app mid-launch
 * has windows before it has an active scene.
 */
- (nullable UIWindow *)keyWindow {
  UIWindow *fallback = nil;
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:UIWindowScene.class]) continue;
    for (UIWindow *window in ((UIWindowScene *)scene).windows) {
      if (window.isHidden) continue;
      if (window.isKeyWindow && scene.activationState == UISceneActivationStateForegroundActive) return window;
      if (fallback == nil) fallback = window;
    }
  }
  return fallback;
}

#pragma mark - Presenting

- (void)present:(UIViewController *)controller from:(UIViewController *)from {
  @synchronized(self) {
    self.active = controller;
  }

  // Wiring up the dismissals UIKit performs but does not report. Without this
  // the two most natural ways to back out of these dialogs leave the promise
  // unsettled — which looks to the app exactly like a dialog that is still open.
  if ([controller isKindOfClass:UIAlertController.class]) {
    // Only the popover's delegate. A `UIAlertController` manages its own
    // presentation controller and reassigning that delegate interferes with it.
    // On iPhone this is never called, because tapping outside an action sheet
    // runs the cancel action's handler; on iPad, where the sheet is a popover,
    // an outside tap runs nothing at all and this is the only report of it.
    controller.popoverPresentationController.delegate = self;
  } else {
    // The date picker's sheet, which the user can swipe away.
    controller.presentationController.delegate = self;
  }

  [from presentViewController:controller animated:YES completion:nil];
}

- (void)configurePopover:(nullable UIPopoverPresentationController *)popover
                    from:(UIViewController *)from
                  anchor:(nullable id)anchor {
  if (popover == nil) return;

  UIView *source = from.view;
  popover.sourceView = source;

  if ([anchor isKindOfClass:NSDictionary.class]) {
    NSDictionary *rect = (NSDictionary *)anchor;
    popover.sourceRect = CGRectMake([rect[@"x"] doubleValue], [rect[@"y"] doubleValue],
                                    [rect[@"width"] doubleValue], [rect[@"height"] doubleValue]);
    popover.permittedArrowDirections = UIPopoverArrowDirectionAny;
    return;
  }

  // No anchor: centre it and permit no arrow directions, which is how UIKit is
  // told to draw a popover with no arrow. It is plainer than a sheet growing
  // out of the control the user touched, and it is not the exception an unset
  // `sourceView` would have raised.
  popover.sourceRect = CGRectMake(CGRectGetMidX(source.bounds), CGRectGetMidY(source.bounds), 0, 0);
  popover.permittedArrowDirections = (UIPopoverArrowDirection)0;
}

- (void)dismissActive {
  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *active = nil;
    @synchronized(self) {
      active = self.active;
    }
    [active dismissViewControllerAnimated:YES completion:nil];
    // Recorded straight away rather than from the dismissal's completion block:
    // this is the app's wording for the outcome, and `finish:` is one-shot so
    // nothing that happens on the way out can overwrite it.
    [self cancelWithMessage:@"dismissed by the app"];
  });
}

#pragma mark - UIAdaptivePresentationControllerDelegate

- (void)presentationControllerDidDismiss:(UIPresentationController *)presentationController {
  [self cancelWithMessage:@"dismissed by the user"];
}

#pragma mark - Results

+ (NSDictionary *)dateResult:(double)millis {
  return @{@"ok" : @YES, @"value" : @(millis)};
}

+ (NSDictionary *)actionResult:(NSInteger)index {
  return @{@"ok" : @YES, @"index" : @(index)};
}

+ (NSDictionary *)failure:(NSString *)reason message:(NSString *)message {
  return @{@"ok" : @NO, @"reason" : reason, @"message" : message};
}

@end
