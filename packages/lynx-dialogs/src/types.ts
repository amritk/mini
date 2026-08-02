/**
 * The shapes that cross between JavaScript and the native module, in one file
 * so the Kotlin and the Objective-C have a single thing to agree with.
 *
 * Everything here is serialised by the engine on its way across, so every type
 * is plain JSON: no `Date`, no `Map`, no class instance. Instants are
 * milliseconds since the epoch for that reason — a `Date` arrives as `{}`.
 */

/**
 * Which fields the picker shows.
 *
 * The three both platforms can present with system UI, and no more. `date` and
 * `time` are one dialog each everywhere; `datetime` is one picker on iOS
 * (`UIDatePickerModeDateAndTime`) and **two dialogs in sequence** on Android,
 * which has no combined widget — see `presentDatePicker` for what that means
 * for the user.
 *
 * Deliberately absent: a range mode. iOS has no native range picker, so a
 * `start`/`end` mode would mean either presenting twice or drawing our own
 * wheel, and a hand-drawn picker is the thing this package exists to avoid.
 * Present twice from your own code if you need one.
 */
export type DatePickerMode = 'date' | 'time' | 'datetime'

/** What the picker opens with, and what it will let the user choose. */
export type DatePickerOptions = {
  /** Defaults to `date`. */
  readonly mode?: DatePickerMode
  /**
   * The instant the picker opens on, in milliseconds since the epoch.
   * Defaults to now.
   *
   * In `time` mode the date half of this is not shown, but it is **kept**: the
   * result carries the chosen time on this value's calendar day. That is what
   * makes a returned timestamp meaningful rather than a time-of-day pinned to
   * whatever day the user happened to be picking on.
   */
  readonly value?: number
  /**
   * The earliest instant the user may choose, in milliseconds since the epoch.
   *
   * **Honoured in `date` and `datetime` only.** `UIDatePicker` ignores its
   * bounds in `.time` mode and Android's `TimePickerDialog` has no notion of
   * them at all, so a bound set on a time picker is a rule neither platform
   * will enforce. Validate a time-of-day yourself after the fact.
   */
  readonly minimum?: number
  /** The latest instant the user may choose. Same `date`/`datetime` caveat as `minimum`. */
  readonly maximum?: number
  /**
   * Round the minute wheel to this many minutes. **iOS only.**
   *
   * `UIDatePicker.minuteInterval` does this natively; Android's
   * `TimePickerDialog` has no equivalent and none can be faked without
   * replacing the widget. Set it if the iOS polish is worth an asymmetry, and
   * round on the JavaScript side if the rule actually matters.
   */
  readonly minuteInterval?: number
  /**
   * Shown above the picker. Defaults to nothing.
   *
   * On iOS this is the title in the sheet's toolbar; on Android it is the
   * dialog title. Both truncate, so keep it to a few words.
   */
  readonly title?: string
  /** The confirm button. Defaults to the system's own OK. */
  readonly confirmLabel?: string
  /** The cancel button. Defaults to the system's own Cancel. */
  readonly cancelLabel?: string
  /**
   * Force a 12- or 24-hour clock instead of following the device's locale.
   *
   * Leave it unset unless the app has a reason to disagree with the user's own
   * setting, which is usually a sign the requirement belongs in formatting
   * rather than in the picker.
   *
   * Android takes this directly. iOS has no such switch — `UIDatePicker` reads
   * it from its locale — so the native side substitutes a locale that formats
   * the way you asked. The effect is the clock you wanted; the mechanism is a
   * locale swap, and it is worth knowing that is what happened.
   */
  readonly use24HourClock?: boolean
}

/** One row of an action sheet. */
export type ActionSheetItem = {
  /** The row's text. */
  readonly label: string
  /**
   * Render this as a destructive choice — red on both platforms.
   *
   * `UIAlertActionStyleDestructive` on iOS; a red label on Android, which has
   * no destructive style of its own for a list row.
   */
  readonly destructive?: boolean
  /**
   * Show the row but do not let it be chosen.
   *
   * A disabled row **never** produces a result, on either platform, so an index
   * you disabled cannot come back to you.
   */
  readonly disabled?: boolean
}

/**
 * Where the sheet should point, in the coordinate space of the Lynx view.
 *
 * **This is not optional on iPad.** A `UIAlertController` in the action-sheet
 * style is presented in a popover there, and UIKit raises an exception if the
 * popover has no source rect to grow from — a real, reproducible crash that
 * never happens on a phone and therefore never happens in testing. The native
 * side will not let that happen: with no anchor it centres the popover on the
 * presenting view and hides the arrow. Passing the rect of whatever the user
 * tapped is what makes it look deliberate instead.
 *
 * Ignored entirely on Android and on iPhone, where a sheet comes up from the
 * bottom edge regardless.
 */
export type ActionSheetAnchor = {
  /** Distance from the left edge of the view, in points. */
  readonly x: number
  /** Distance from the top edge of the view, in points. */
  readonly y: number
  /** Defaults to 0, which makes the anchor a point rather than a rectangle. */
  readonly width?: number
  /** Defaults to 0. */
  readonly height?: number
}

/** What to show in the sheet. */
export type ActionSheetOptions = {
  /** Shown at the top, above `message`. Optional on both platforms. */
  readonly title?: string
  /** A line of explanation under the title. */
  readonly message?: string
  /**
   * The rows, in the order they are shown.
   *
   * Result indices are positions in **this** array, disabled rows included, so
   * a row's index does not move when a neighbour is disabled. An empty array is
   * allowed and produces a sheet the user can only cancel — legal, and almost
   * always a bug in the calling code.
   */
  readonly actions: readonly ActionSheetItem[]
  /** The cancel row. Defaults to the system's own Cancel. */
  readonly cancelLabel?: string
  /** iPad only, and read the note on `ActionSheetAnchor` before ignoring it. */
  readonly anchor?: ActionSheetAnchor
}

/** How a button reads, and where the platform puts it. */
export type AlertButtonStyle =
  /** An ordinary choice. */
  | 'default'
  /**
   * The way out. Bold on iOS, and the one iOS moves to the left of a two-button
   * alert no matter what order you added it in.
   *
   * **At most one button may have it.** `UIAlertController` raises on a second
   * cancel action — a real crash — so the native side demotes any extra to
   * `default` rather than passing it on. Set it on the button that means "do
   * nothing", and on no other.
   */
  | 'cancel'
  /** Red on both platforms. For the button that deletes something. */
  | 'destructive'

/** One button on an alert. */
export type AlertButton = {
  /** The button's text. */
  readonly label: string
  /** Defaults to `default`. */
  readonly style?: AlertButtonStyle
}

/**
 * One, two or three buttons — and three is a platform limit, not a house style.
 *
 * Android's `AlertDialog` has exactly three button slots (positive, negative,
 * neutral) and there is no fourth. iOS would stack more happily, but an alert
 * that reads one way on a phone and loses a button on the other is worse than
 * one that never offered it, so the cap is the same on both and the type is
 * where you find out.
 *
 * If you need more choices than this, you want `presentActionSheet` — a list is
 * what both platforms offer for exactly that.
 *
 * The array's order is the order the buttons are read left to right on Android.
 * iOS reserves the right to move the `cancel` one, and does.
 */
export type AlertButtons =
  | readonly [AlertButton]
  | readonly [AlertButton, AlertButton]
  | readonly [AlertButton, AlertButton, AlertButton]

/** What to show in the alert. */
export type AlertOptions = {
  /** The question, in a few words. Shown in bold at the top. */
  readonly title?: string
  /** The detail under it. Where the consequence of the destructive button goes. */
  readonly message?: string
  /**
   * The buttons, in order. At least one — see `AlertButtons` for why at most
   * three.
   *
   * At least one matters more than it looks: an iOS alert has **no** way out
   * except its own buttons. It cannot be tapped away, swiped away, or dismissed
   * with a gesture, so an alert with no buttons is an app the user cannot use
   * again. The native halves refuse to present one rather than trusting the
   * type, and answer `{ ok: false, reason: 'unavailable' }` instead.
   */
  readonly buttons: AlertButtons
}

/**
 * Why a dialog produced no choice.
 *
 * - `dismissed` — the user cancelled: the cancel button, a tap outside, the
 *   Android back gesture, or a swipe down on the iOS sheet. This is the common
 *   case and it is not an error.
 * - `busy` — something was already on screen. One dialog at a time is a rule
 *   this package enforces rather than a limit it ran into; see
 *   `presentActionSheet` for why.
 * - `unavailable` — there was nothing to present from (no resumed Activity, no
 *   key window) or the native module is not linked into this host app.
 */
export type DialogDismissReason = 'dismissed' | 'busy' | 'unavailable'

/**
 * The outcome of a date picker.
 *
 * A discriminated union rather than a rejection, for the reason every result in
 * this repository's native packages is one: Lynx has no error convention for
 * bridge callbacks, so a failure has to travel as a value anyway — and
 * "the user tapped Cancel" is an ordinary branch in a UI, not an exception.
 * Making it a `throw` would put a `try`/`catch` around the single most likely
 * thing a user does with a dialog.
 *
 * @example
 * ```ts
 * const result = await presentDatePicker({ mode: 'date' })
 * if (result.ok) setBirthday(new Date(result.value))
 * ```
 */
export type DatePickerResult =
  | { readonly ok: true; readonly value: number }
  | {
      readonly ok: false
      readonly reason: DialogDismissReason
      /** A native-side description. For logs, not for showing to a user. */
      readonly message: string
    }

/**
 * The outcome of an action sheet.
 *
 * `index` is a position in the `actions` array you passed, which is the only
 * thing that makes the result useful — so the native halves are required to
 * keep the array's original indices even when rows are disabled.
 *
 * @example
 * ```ts
 * const result = await presentActionSheet({ actions: [{ label: 'Copy' }, { label: 'Delete', destructive: true }] })
 * if (result.ok && result.index === 1) remove()
 * ```
 */
export type ActionSheetResult =
  | { readonly ok: true; readonly index: number }
  | { readonly ok: false; readonly reason: DialogDismissReason; readonly message: string }

/**
 * The outcome of an alert.
 *
 * `index` is a position in the `buttons` array you passed.
 *
 * The `dismissed` case is **Android-only in practice**. An `AlertDialog` can be
 * cancelled with the back gesture or a tap outside, and this package leaves that
 * alone because taking it away is the kind of thing Android users notice. An
 * iOS alert has no such route, so a screen that only ever runs on a phone will
 * still see `dismissed` from an Android device and from `dismissActiveDialog`.
 * Handle it.
 *
 * @example
 * ```ts
 * const result = await presentAlert({
 *   title: 'Delete this photo?',
 *   message: 'This cannot be undone.',
 *   buttons: [{ label: 'Cancel', style: 'cancel' }, { label: 'Delete', style: 'destructive' }],
 * })
 * if (result.ok && result.index === 1) remove()
 * ```
 */
export type AlertResult =
  | { readonly ok: true; readonly index: number }
  | { readonly ok: false; readonly reason: DialogDismissReason; readonly message: string }
