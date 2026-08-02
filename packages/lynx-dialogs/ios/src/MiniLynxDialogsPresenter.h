#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * The reason codes that cross to JavaScript, as `DialogDismissReason` spells
 * them.
 *
 * Constants rather than literals at the call sites because a typo in one is a
 * branch on the other side that silently never runs, and no compiler on either
 * side can see it. `src/native-contract.test.ts` reads this file to check that
 * Kotlin and Objective-C know the same three.
 */
extern NSString *const MiniLynxDialogReasonDismissed;
extern NSString *const MiniLynxDialogReasonBusy;
extern NSString *const MiniLynxDialogReasonUnavailable;

/**
 * The process-wide half of the iOS implementation: the one presentation slot,
 * the search for something to present from, and the single answer each
 * presentation owes JavaScript.
 *
 * It is a singleton for the reason `MiniLynxLocationCenter` is one — the state
 * outlives the call that created it — and for a second reason of its own: a
 * host app may have more than one LynxView, and they share a window. A slot
 * held per module instance would let two views put a sheet up and hand the user
 * both.
 *
 * ## Exactly one answer per presentation
 *
 * Invoking a Lynx callback twice is not recoverable on the other side, and a
 * dialog has several routes to an answer that can fire for one interaction: a
 * button handler, an interactive dismissal, and `dismissActiveDialog` all reach
 * the same presentation. Every route goes through `finish:`, which settles once
 * and ignores the rest.
 */
@interface MiniLynxDialogsPresenter : NSObject <UIPopoverPresentationControllerDelegate>

@property(class, nonatomic, readonly) MiniLynxDialogsPresenter *shared;

/**
 * Claims the one presentation slot, or answers NO because something is already
 * on screen.
 *
 * Called on whichever thread the bridge used, deliberately: the caller gets its
 * `busy` answer immediately rather than after a hop, so two presentations
 * racing cannot both find the slot free.
 */
- (BOOL)beginWithCompletion:(void (^)(NSDictionary *result))completion;

/** Settles the current presentation. The first call wins; later ones do nothing. */
- (void)finish:(NSDictionary *)result;

/** Settles the current presentation as a cancellation. */
- (void)cancelWithMessage:(NSString *)message;

/**
 * The view controller a modal should be presented from, or nil when there is
 * nothing on screen to present from.
 *
 * Main queue only — it reads `UIApplication`. Nil is a real answer rather than
 * a failure to look properly: a backgrounded app genuinely has nowhere to put a
 * dialog, and `unavailable` is a better outcome than one appearing over
 * whatever the user comes back to.
 */
- (nullable UIViewController *)topViewController;

/** Presents, and wires up the dismissals UIKit will not otherwise report. */
- (void)present:(UIViewController *)controller from:(UIViewController *)from;

/**
 * Points an action sheet's popover at something, which on iPad is not optional.
 *
 * A `UIAlertController` in the action-sheet style is a popover there, and UIKit
 * raises an exception if it has no source view — a crash that cannot happen on
 * a phone and therefore never happens in testing. With no anchor this centres
 * the popover on the presenting view and hides the arrow, which is plain but is
 * not a crash.
 */
- (void)configurePopover:(nullable UIPopoverPresentationController *)popover
                    from:(UIViewController *)from
                  anchor:(nullable id)anchor;

/** Closes whatever is on screen and settles it as a dismissal. */
- (void)dismissActive;

/** The result shapes, built in one place so both call sites spell them alike. */
+ (NSDictionary *)dateResult:(double)millis;
+ (NSDictionary *)actionResult:(NSInteger)index;
+ (NSDictionary *)failure:(NSString *)reason message:(NSString *)message;

@end

NS_ASSUME_NONNULL_END
