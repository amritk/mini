#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * A sheet holding a `UIDatePicker`, with a cancel and a confirm button.
 *
 * ## Why there is a controller here at all
 *
 * Because iOS has no "present a date picker" call. `UIDatePicker` is a *view* —
 * UIKit gives you the wheels, the calendar, the locale handling and the
 * haptics, and leaves presenting them to you. Android's equivalents are whole
 * dialogs, so this file is the difference between the two platforms rather than
 * a preference: without it there is nothing to present.
 *
 * What it deliberately is not is a *picker* of our own. Every part the user
 * touches is `UIDatePicker`; this is a toolbar and two constraints around it.
 *
 * ## Set the properties before presenting
 *
 * They are read once, in `viewDidLoad`. Changing one after the sheet is up does
 * nothing, which is the ordinary UIKit bargain for configuration like this.
 */
@interface MiniLynxDatePickerController : UIViewController

/** Which fields the picker shows. Defaults to `UIDatePickerModeDate`. */
@property(nonatomic) UIDatePickerMode mode;

/** What the picker opens on. Defaults to now. */
@property(nonatomic, strong, nullable) NSDate *initialDate;

/** Ignored by `UIDatePicker` in `UIDatePickerModeTime`, which is why the module does not set them there. */
@property(nonatomic, strong, nullable) NSDate *minimumDate;
@property(nonatomic, strong, nullable) NSDate *maximumDate;

/**
 * Minute granularity. Applied only when it divides 60 exactly — UIKit raises on
 * a value that does not, and an options bag should not be able to crash an app.
 */
@property(nonatomic) NSInteger minuteInterval;

/** Substituted to force a 12- or 24-hour clock, which `UIDatePicker` has no direct switch for. */
@property(nonatomic, strong, nullable) NSLocale *pickerLocale;

/** Shown centred in the toolbar. Named around `UIViewController.title`, which is a different thing. */
@property(nonatomic, copy, nullable) NSString *headline;

/** Nil takes the system's own localised button instead, which is the better default. */
@property(nonatomic, copy, nullable) NSString *confirmLabel;
@property(nonatomic, copy, nullable) NSString *cancelLabel;

/** Called once, after the sheet has begun dismissing itself. */
@property(nonatomic, copy, nullable) void (^onConfirm)(NSDate *date);
@property(nonatomic, copy, nullable) void (^onCancel)(void);

/**
 * Applies the sheet presentation. Call it before presenting.
 *
 * Kept out of `init` so the presentation style is set at the point it is used,
 * next to the `present:` call that depends on it.
 */
- (void)prepareForPresentation;

@end

NS_ASSUME_NONNULL_END
