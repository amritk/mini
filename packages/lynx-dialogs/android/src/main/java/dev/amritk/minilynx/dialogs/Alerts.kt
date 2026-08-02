package dev.amritk.minilynx.dialogs

import android.app.Activity
import android.app.AlertDialog
import android.content.DialogInterface

/** One button, as it arrived from JavaScript. */
private data class AlertButton(val label: String, val style: String)

/**
 * The alert: a title, a message and up to three buttons.
 *
 * ## Three, and why the JavaScript side says so
 *
 * `AlertDialog` has exactly three button slots — positive, negative and
 * neutral — and there is no fourth. That is the reason `AlertButtons` is a
 * one-to-three tuple rather than an array: iOS would stack more happily, and an
 * alert that quietly loses its third choice on half the devices it runs on is a
 * bug nobody finds until a support ticket describes it.
 *
 * The slots are filled so that the array's order is the order the buttons are
 * *read*, left to right: Android lays them out negative, neutral, positive
 * regardless of the order they were added, so a two-button alert puts
 * `buttons[0]` on the left and `buttons[1]` on the right, and a three-button
 * one fills the middle. Nothing about this transfers to iOS, which lays alerts
 * out its own way — `presentAlert` tells the caller to order for reading and
 * never for position.
 */
internal object Alerts {
  fun present(activity: Activity, options: Map<String, Any?>, session: DialogSession) {
    val buttons =
      Options.maps(options, "buttons")
        .map { entry -> AlertButton(Options.string(entry, "label", ""), Options.string(entry, "style", "default")) }
        // Defensive rather than expected: the tuple type on the JavaScript side
        // makes a fourth button unreachable from typed code, and a caller who
        // cast around it gets three rather than an exception from the platform.
        .take(SLOTS.size)

    // An alert with no buttons is refused rather than shown. On Android it would
    // merely be odd; the shared contract is set by iOS, where an alert has no
    // dismissal gesture at all and one with no buttons is an app the user cannot
    // get out of. Both halves answer the same way so a bug cannot be
    // platform-specific.
    if (buttons.isEmpty()) {
      session.finish(DialogResults.failure(DialogResults.UNAVAILABLE, "an alert needs at least one button"))
      return
    }

    // Which slot each button went into, so a press can be turned back into the
    // caller's own index. Android reports the slot, not the position.
    val slots = SLOTS[buttons.size - 1]
    val indexBySlot = slots.withIndex().associate { (index, slot) -> slot to index }

    val onClick =
      DialogInterface.OnClickListener { _, which ->
        indexBySlot[which]?.let { session.finish(DialogResults.action(it)) }
      }

    val builder = AlertDialog.Builder(activity)
    Options.stringOrNull(options, "title")?.let { builder.setTitle(it) }
    // Safe here, unlike on the action sheet: a message and *buttons* coexist
    // fine. It is a message and a **list** that `AlertDialog` cannot show
    // together — see `ActionSheets`.
    Options.stringOrNull(options, "message")?.let { builder.setMessage(it) }

    buttons.forEachIndexed { index, button ->
      when (slots[index]) {
        DialogInterface.BUTTON_POSITIVE -> builder.setPositiveButton(button.label, onClick)
        DialogInterface.BUTTON_NEGATIVE -> builder.setNegativeButton(button.label, onClick)
        else -> builder.setNeutralButton(button.label, onClick)
      }
    }

    val dialog = builder.create()
    // Left cancelable, which is the one place this deliberately differs from
    // iOS. The back gesture dismissing a dialog is something Android users
    // expect everywhere else in the system, and taking it away to match a
    // platform they are not on is not an improvement. `AlertResult` warns the
    // caller that `dismissed` is a real outcome here.
    dialog.setOnDismissListener { session.cancel("the alert was dismissed") }
    session.show(dialog)

    // After `show`, and it has to be: `getButton` returns null until the dialog
    // has built its view, so tinting any earlier silently does nothing. Android
    // has no destructive button style of its own, so this is the same system red
    // the action sheet's rows use.
    val destructive = activity.getColor(android.R.color.holo_red_dark)
    buttons.forEachIndexed { index, button ->
      if (button.style == "destructive") dialog.getButton(slots[index])?.setTextColor(destructive)
    }
  }

  /**
   * The slots to fill for one, two and three buttons.
   *
   * A single button goes in the positive slot because that is the one Android
   * places on its own at the right, where a lone "OK" belongs.
   */
  private val SLOTS =
    listOf(
      intArrayOf(DialogInterface.BUTTON_POSITIVE),
      intArrayOf(DialogInterface.BUTTON_NEGATIVE, DialogInterface.BUTTON_POSITIVE),
      intArrayOf(DialogInterface.BUTTON_NEGATIVE, DialogInterface.BUTTON_NEUTRAL, DialogInterface.BUTTON_POSITIVE),
    )
}
