#import "MiniLynxDatePickerController.h"

@interface MiniLynxDatePickerController ()
@property(nonatomic, strong) UIDatePicker *picker;
@end

@implementation MiniLynxDatePickerController

- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = UIColor.systemBackgroundColor;

  UIToolbar *bar = [self buildToolbar];
  UIDatePicker *picker = [self buildPicker];
  self.picker = picker;

  [self.view addSubview:bar];
  [self.view addSubview:picker];

  UILayoutGuide *safe = self.view.safeAreaLayoutGuide;
  [NSLayoutConstraint activateConstraints:@[
    [bar.topAnchor constraintEqualToAnchor:safe.topAnchor],
    [bar.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
    [bar.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
    [picker.topAnchor constraintEqualToAnchor:bar.bottomAnchor],
    [picker.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
    [picker.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
    // Less-than rather than equal: the wheels have an intrinsic height and
    // stretching them to fill a sheet that is taller than they want makes the
    // spacing wrong. This lets the picker sit at its natural size and leaves
    // whatever is left over below it.
    [picker.bottomAnchor constraintLessThanOrEqualToAnchor:safe.bottomAnchor],
  ]];
}

- (UIDatePicker *)buildPicker {
  UIDatePicker *picker = [[UIDatePicker alloc] init];
  picker.translatesAutoresizingMaskIntoConstraints = NO;
  picker.datePickerMode = self.mode;

  // Wheels rather than the iOS 14 default. In a sheet this size the compact
  // style would draw a button that opens *another* picker, which is a second
  // tap and a second surface for something the user already asked to see. It
  // also keeps the three modes looking like one control instead of three.
  if (@available(iOS 13.4, *)) {
    picker.preferredDatePickerStyle = UIDatePickerStyleWheels;
  }

  if (self.pickerLocale != nil) picker.locale = self.pickerLocale;
  if (self.minimumDate != nil) picker.minimumDate = self.minimumDate;
  if (self.maximumDate != nil) picker.maximumDate = self.maximumDate;
  // Guarded because UIKit raises on an interval that does not divide 60, and an
  // options bag arriving from JavaScript must not be able to take the app down.
  if (self.minuteInterval > 0 && 60 % self.minuteInterval == 0) picker.minuteInterval = self.minuteInterval;
  // Set last, so the bounds above are already in place to clamp it.
  picker.date = self.initialDate ?: NSDate.date;
  return picker;
}

- (UIToolbar *)buildToolbar {
  UIToolbar *bar = [[UIToolbar alloc] init];
  bar.translatesAutoresizingMaskIntoConstraints = NO;

  // The system items are used whenever the app did not ask for its own wording,
  // because UIKit localises those and a hardcoded @"Cancel" would ship English
  // to every device.
  UIBarButtonItem *cancel =
      self.cancelLabel.length > 0
          ? [[UIBarButtonItem alloc] initWithTitle:self.cancelLabel
                                             style:UIBarButtonItemStylePlain
                                            target:self
                                            action:@selector(cancelTapped)]
          : [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemCancel
                                                          target:self
                                                          action:@selector(cancelTapped)];

  UIBarButtonItem *confirm =
      self.confirmLabel.length > 0
          ? [[UIBarButtonItem alloc] initWithTitle:self.confirmLabel
                                             style:UIBarButtonItemStyleDone
                                            target:self
                                            action:@selector(confirmTapped)]
          : [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemDone
                                                          target:self
                                                          action:@selector(confirmTapped)];

  NSMutableArray<UIBarButtonItem *> *items = [NSMutableArray arrayWithObject:cancel];
  [items addObject:[self flexibleSpace]];
  if (self.headline.length > 0) {
    [items addObject:[[UIBarButtonItem alloc] initWithCustomView:[self headlineLabel]]];
    // A second instance rather than the same one twice: a `UIToolbar` positions
    // its items by identity, and one space object in two slots collapses.
    [items addObject:[self flexibleSpace]];
  }
  [items addObject:confirm];
  bar.items = items;
  return bar;
}

- (UIBarButtonItem *)flexibleSpace {
  return [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemFlexibleSpace target:nil action:nil];
}

- (UILabel *)headlineLabel {
  UILabel *label = [[UILabel alloc] init];
  label.text = self.headline;
  label.font = [UIFont preferredFontForTextStyle:UIFontTextStyleHeadline];
  label.textAlignment = NSTextAlignmentCenter;
  [label sizeToFit];
  return label;
}

- (void)prepareForPresentation {
  self.modalPresentationStyle = UIModalPresentationPageSheet;
  if (@available(iOS 15.0, *)) {
    // Half height, which is about what the wheels want. Below iOS 15 there are
    // no detents and the sheet comes up full height — plainer, and still the
    // system's own sheet.
    UISheetPresentationController *sheet = self.sheetPresentationController;
    sheet.detents = @[ UISheetPresentationControllerDetent.mediumDetent ];
    sheet.prefersGrabberVisible = YES;
  }
}

#pragma mark - Answers

- (void)confirmTapped {
  NSDate *date = self.picker.date;
  void (^onConfirm)(NSDate *) = self.onConfirm;
  // Read out of the properties before dismissing, and dismissed before the
  // block runs: the block settles the presentation, and whatever the app does
  // next — including presenting again — should not be racing this sheet's own
  // teardown.
  [self dismissViewControllerAnimated:YES completion:nil];
  if (onConfirm) onConfirm(date);
}

- (void)cancelTapped {
  void (^onCancel)(void) = self.onCancel;
  [self dismissViewControllerAnimated:YES completion:nil];
  if (onCancel) onCancel();
}

@end
