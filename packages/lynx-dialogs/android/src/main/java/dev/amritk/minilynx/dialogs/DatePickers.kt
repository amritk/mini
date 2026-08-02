package dev.amritk.minilynx.dialogs

import android.app.Activity
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.DialogInterface
import android.text.format.DateFormat
import java.util.Calendar

/**
 * The system date and time dialogs, and the two-step dance `datetime` needs.
 *
 * ## Android has no combined picker, and never has
 *
 * `DatePickerDialog` picks a day and `TimePickerDialog` picks a time, and there
 * has never been a widget that does both. So `datetime` is the first dialog
 * followed by the second, and the user sees two steps where an iPhone user sees
 * one. The alternative would be drawing a combined picker ourselves, which is
 * the thing this package exists so that nobody has to.
 *
 * Cancelling **either** step cancels the whole presentation. A half-answered
 * datetime — a day with whatever time of day the value happened to carry — is
 * not a value worth handing back, and an app that got one would have no way to
 * tell it from a real answer.
 *
 * ## The calendar is carried through, not rebuilt
 *
 * One `Calendar` is seeded from the caller's `value` and each step overwrites
 * only the fields it owns. That is what makes the modes compose: picking a day
 * keeps the time of day it came in with, picking a time keeps the day, and
 * `datetime` is just both in turn. It also matches `UIDatePicker`, whose `date`
 * property retains the components its mode does not show — so the two platforms
 * agree on what a result means without either of them having to special-case
 * it.
 */
internal object DatePickers {
  fun present(activity: Activity, options: Map<String, Any?>, session: DialogSession) {
    val calendar = Calendar.getInstance()
    Options.longOrNull(options, "value")?.let { calendar.timeInMillis = it }

    when (Options.string(options, "mode", "date")) {
      "time" -> showTime(activity, options, session, calendar)
      "datetime" -> showDate(activity, options, session, calendar, thenTime = true)
      else -> showDate(activity, options, session, calendar, thenTime = false)
    }
  }

  private fun showDate(
    activity: Activity,
    options: Map<String, Any?>,
    session: DialogSession,
    calendar: Calendar,
    thenTime: Boolean,
  ) {
    val minimum = Options.longOrNull(options, "minimum")
    val maximum = Options.longOrNull(options, "maximum")

    // Clamped before the dialog is built, not after. `DatePicker` will not open
    // on a date outside its own bounds, and handing it one produces a picker
    // showing something the user never asked for — so the starting point moves
    // to the nearest allowed day and the bounds are what they were asked to be.
    if (minimum != null && calendar.timeInMillis < minimum) calendar.timeInMillis = minimum
    if (maximum != null && calendar.timeInMillis > maximum) calendar.timeInMillis = maximum

    // Set when this step has handed over to the time step, so the dismiss
    // listener below can tell "the user moved on" from "the user backed out".
    // Without it, `datetime`'s first dialog closing normally would be read as a
    // cancellation and settle the promise before the second dialog was answered.
    var advanced = false

    val dialog =
      DatePickerDialog(
        activity,
        { _, year, month, dayOfMonth ->
          calendar.set(Calendar.YEAR, year)
          calendar.set(Calendar.MONTH, month)
          calendar.set(Calendar.DAY_OF_MONTH, dayOfMonth)
          if (thenTime) {
            advanced = true
            showTime(activity, options, session, calendar)
          } else {
            session.finish(DialogResults.date(calendar.timeInMillis))
          }
        },
        calendar.get(Calendar.YEAR),
        calendar.get(Calendar.MONTH),
        calendar.get(Calendar.DAY_OF_MONTH),
      )

    // An inverted range is ignored rather than enforced: `DatePicker` throws
    // when its minimum passes its maximum, and crashing an app over an options
    // bag is a worse answer than showing an unbounded picker.
    if (minimum == null || maximum == null || minimum <= maximum) {
      minimum?.let { dialog.datePicker.minDate = it }
      maximum?.let { dialog.datePicker.maxDate = it }
    }

    Options.stringOrNull(options, "title")?.let { dialog.setTitle(it) }
    // `DatePickerDialog` is its own button listener — passing it back is how the
    // stock behaviour survives a relabelled button. Wiring a listener of our own
    // here would mean re-implementing "confirm reads the picker" and "cancel
    // cancels", both of which it already does correctly.
    Options.stringOrNull(options, "confirmLabel")?.let {
      dialog.setButton(DialogInterface.BUTTON_POSITIVE, it, dialog)
    }
    Options.stringOrNull(options, "cancelLabel")?.let { dialog.setButton(DialogInterface.BUTTON_NEGATIVE, it, dialog) }

    // Dismissal is the one event every way out has in common — the cancel
    // button, the back gesture, a tap outside, and the Activity going away
    // underneath it. `DialogSession.finish` is one-shot, so a confirmed picker
    // has already answered by the time this runs and this does nothing.
    dialog.setOnDismissListener { if (!advanced) session.cancel("the date picker was dismissed") }
    session.show(dialog)
  }

  private fun showTime(activity: Activity, options: Map<String, Any?>, session: DialogSession, calendar: Calendar) {
    val is24Hour = Options.booleanOrNull(options, "use24HourClock") ?: DateFormat.is24HourFormat(activity)

    val dialog =
      TimePickerDialog(
        activity,
        { _, hourOfDay, minute ->
          calendar.set(Calendar.HOUR_OF_DAY, hourOfDay)
          calendar.set(Calendar.MINUTE, minute)
          // Zeroed because the user chose to the minute. Carrying the seconds
          // the value happened to arrive with would put the moment the picker
          // opened into an answer the user believes they gave — and it is iOS
          // that has to match this, since `UIDatePicker` has no seconds either.
          calendar.set(Calendar.SECOND, 0)
          calendar.set(Calendar.MILLISECOND, 0)
          session.finish(DialogResults.date(calendar.timeInMillis))
        },
        calendar.get(Calendar.HOUR_OF_DAY),
        calendar.get(Calendar.MINUTE),
        is24Hour,
      )

    // `minimum` and `maximum` are deliberately not applied. `TimePickerDialog`
    // has no notion of bounds, and faking them by rejecting a confirmed time
    // would leave the user tapping a button that appears to do nothing.
    // `DatePickerOptions` says so on the JavaScript side.
    Options.stringOrNull(options, "title")?.let { dialog.setTitle(it) }
    Options.stringOrNull(options, "confirmLabel")?.let {
      dialog.setButton(DialogInterface.BUTTON_POSITIVE, it, dialog)
    }
    Options.stringOrNull(options, "cancelLabel")?.let { dialog.setButton(DialogInterface.BUTTON_NEGATIVE, it, dialog) }

    dialog.setOnDismissListener { session.cancel("the time picker was dismissed") }
    session.show(dialog)
  }
}
