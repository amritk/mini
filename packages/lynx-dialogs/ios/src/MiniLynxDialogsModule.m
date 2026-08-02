#import "MiniLynxDialogsModule.h"

#import <Lynx/LynxContext.h>

#import "MiniLynxDatePickerController.h"
#import "MiniLynxDialogsPresenter.h"

/** Milliseconds on the wire, an `NSDate` here. Nil for anything that is not a number. */
static NSDate *MiniLynxDateFromMillis(id value) {
  if (![value isKindOfClass:NSNumber.class]) return nil;
  return [NSDate dateWithTimeIntervalSince1970:[value doubleValue] / 1000.0];
}

/** A string option, or nil — so "not set" stays distinguishable from empty. */
static NSString *MiniLynxStringOrNil(id value) {
  return [value isKindOfClass:NSString.class] ? (NSString *)value : nil;
}

/**
 * The chosen instant in milliseconds, with the seconds zeroed for the two modes
 * that let the user pick a time.
 *
 * `UIDatePicker` keeps the seconds of whatever date it was handed, so a picker
 * opened at 14:32:47 and confirmed without touching the wheels would answer
 * :47 — a precision the user never chose and could not see. Android's
 * `TimePickerDialog` offers hours and minutes and nothing else, so trimming
 * here is also what makes both platforms return the same value for the same
 * interaction.
 *
 * `date` mode is left exactly as it is: the user did not touch the time, so the
 * time of day the caller passed in comes back untouched. That is what makes the
 * modes compose — the same rule the Kotlin follows by carrying one `Calendar`
 * through both steps.
 */
static double MiniLynxMillisFor(NSDate *date, UIDatePickerMode mode) {
  if (mode == UIDatePickerModeDate) return date.timeIntervalSince1970 * 1000.0;

  NSCalendar *calendar = NSCalendar.currentCalendar;
  NSCalendarUnit units =
      NSCalendarUnitYear | NSCalendarUnitMonth | NSCalendarUnitDay | NSCalendarUnitHour | NSCalendarUnitMinute;
  NSDate *trimmed = [calendar dateFromComponents:[calendar components:units fromDate:date]];
  return (trimmed ?: date).timeIntervalSince1970 * 1000.0;
}

@implementation MiniLynxDialogsModule

+ (NSString *)name {
  return @"MiniLynxDialogsModule";
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
    @"presentDatePicker" : NSStringFromSelector(@selector(presentDatePicker:callback:)),
    @"presentActionSheet" : NSStringFromSelector(@selector(presentActionSheet:callback:)),
    @"dismissActiveDialog" : NSStringFromSelector(@selector(dismissActiveDialog)),
  };
}

/**
 * The context is required by the protocol and unused by this module.
 *
 * `@amritk/lynx-location` keeps its context to publish events through; nothing
 * here publishes anything, and a dialog is presented from the key window rather
 * than from anything the LynxContext knows about. Conforming to
 * `LynxContextModule` anyway keeps registration identical to the other modules
 * in this repository, which is worth more than saving an ignored argument.
 */
- (instancetype)initWithLynxContext:(LynxContext *)context {
  self = [super init];
  return self;
}

#pragma mark - Date picker

- (void)presentDatePicker:(NSDictionary *)options callback:(void (^)(id))callback {
  MiniLynxDialogsPresenter *presenter = MiniLynxDialogsPresenter.shared;
  if (![presenter beginWithCompletion:^(NSDictionary *result) {
        callback(result);
      }]) {
    callback([MiniLynxDialogsPresenter failure:MiniLynxDialogReasonBusy
                                       message:@"another dialog is already presented"]);
    return;
  }

  // Every UIKit call from here down, on the queue UIKit requires. A bridge call
  // arrives on whichever thread Lynx used, and presenting from it is undefined
  // behaviour that mostly looks like working code until it does not.
  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *from = [presenter topViewController];
    if (from == nil) {
      [presenter finish:[MiniLynxDialogsPresenter failure:MiniLynxDialogReasonUnavailable
                                                  message:@"there is no key window to present a dialog from"]];
      return;
    }

    NSString *mode = MiniLynxStringOrNil(options[@"mode"]) ?: @"date";
    UIDatePickerMode pickerMode = UIDatePickerModeDate;
    if ([mode isEqualToString:@"time"]) {
      pickerMode = UIDatePickerModeTime;
    } else if ([mode isEqualToString:@"datetime"]) {
      pickerMode = UIDatePickerModeDateAndTime;
    }

    MiniLynxDatePickerController *controller = [[MiniLynxDatePickerController alloc] init];
    controller.mode = pickerMode;
    controller.initialDate = MiniLynxDateFromMillis(options[@"value"]);
    // Not set in time mode, because `UIDatePicker` ignores them there and a
    // bound that silently does nothing is worse than one that was never
    // applied. `DatePickerOptions` says the same thing to the caller, and
    // Android's `TimePickerDialog` cannot honour them either.
    if (pickerMode != UIDatePickerModeTime) {
      controller.minimumDate = MiniLynxDateFromMillis(options[@"minimum"]);
      controller.maximumDate = MiniLynxDateFromMillis(options[@"maximum"]);
    }
    controller.minuteInterval = [options[@"minuteInterval"] integerValue];
    controller.headline = MiniLynxStringOrNil(options[@"title"]);
    controller.confirmLabel = MiniLynxStringOrNil(options[@"confirmLabel"]);
    controller.cancelLabel = MiniLynxStringOrNil(options[@"cancelLabel"]);

    // `UIDatePicker` has no 12/24-hour switch — it reads the clock from its
    // locale — so forcing one means substituting a locale that formats the way
    // the caller asked. `DatePickerOptions` says that is what happens.
    id use24Hour = options[@"use24HourClock"];
    if ([use24Hour isKindOfClass:NSNumber.class]) {
      controller.pickerLocale =
          [NSLocale localeWithLocaleIdentifier:([use24Hour boolValue] ? @"en_GB" : @"en_US")];
    }

    controller.onConfirm = ^(NSDate *date) {
      [presenter finish:[MiniLynxDialogsPresenter dateResult:MiniLynxMillisFor(date, pickerMode)]];
    };
    controller.onCancel = ^{
      [presenter cancelWithMessage:@"cancelled by the user"];
    };

    [controller prepareForPresentation];
    [presenter present:controller from:from];
  });
}

#pragma mark - Action sheet

- (void)presentActionSheet:(NSDictionary *)options callback:(void (^)(id))callback {
  MiniLynxDialogsPresenter *presenter = MiniLynxDialogsPresenter.shared;
  if (![presenter beginWithCompletion:^(NSDictionary *result) {
        callback(result);
      }]) {
    callback([MiniLynxDialogsPresenter failure:MiniLynxDialogReasonBusy
                                       message:@"another dialog is already presented"]);
    return;
  }

  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *from = [presenter topViewController];
    if (from == nil) {
      [presenter finish:[MiniLynxDialogsPresenter failure:MiniLynxDialogReasonUnavailable
                                                  message:@"there is no key window to present a dialog from"]];
      return;
    }

    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:MiniLynxStringOrNil(options[@"title"])
                                                                  message:MiniLynxStringOrNil(options[@"message"])
                                                           preferredStyle:UIAlertControllerStyleActionSheet];

    NSArray *actions = [options[@"actions"] isKindOfClass:NSArray.class] ? options[@"actions"] : @[];
    for (NSUInteger index = 0; index < actions.count; index++) {
      NSDictionary *entry = [actions[index] isKindOfClass:NSDictionary.class] ? actions[index] : @{};
      BOOL destructive = [entry[@"destructive"] boolValue];

      UIAlertAction *action = [UIAlertAction
          actionWithTitle:(MiniLynxStringOrNil(entry[@"label"]) ?: @"")
                    style:(destructive ? UIAlertActionStyleDestructive : UIAlertActionStyleDefault)
                  handler:^(UIAlertAction *chosen) {
                    // `index` is captured by value, so each row carries its own
                    // position in the array JavaScript passed — which is what
                    // `ActionSheetResult.index` promises, disabled rows
                    // included. Nothing here compacts the list.
                    [presenter finish:[MiniLynxDialogsPresenter actionResult:(NSInteger)index]];
                  }];
      // Still added, still visible, and not choosable — which is exactly what
      // `ActionSheetItem.disabled` describes.
      action.enabled = ![entry[@"disabled"] boolValue];
      [sheet addAction:action];
    }

    // There is no system-provided cancel title for a `UIAlertController` the way
    // there is for a `UIBarButtonItem`, so this default ships in English. An app
    // that localises passes `cancelLabel`, which is the only honest option here.
    NSString *cancelLabel = MiniLynxStringOrNil(options[@"cancelLabel"]) ?: @"Cancel";
    [sheet addAction:[UIAlertAction actionWithTitle:cancelLabel
                                              style:UIAlertActionStyleCancel
                                            handler:^(UIAlertAction *chosen) {
                                              [presenter cancelWithMessage:@"cancelled by the user"];
                                            }]];

    // Before presenting, and not optional: an action sheet is a popover on
    // iPad and UIKit raises if it has nothing to grow from.
    [presenter configurePopover:sheet.popoverPresentationController from:from anchor:options[@"anchor"]];
    [presenter present:sheet from:from];
  });
}

#pragma mark - Dismissing

- (void)dismissActiveDialog {
  [MiniLynxDialogsPresenter.shared dismissActive];
}

@end
