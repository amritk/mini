package dev.amritk.minilynx.dialogs

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The action sheet, as an `AlertDialog` with a list in it.
 *
 * `android.app.AlertDialog` rather than the AppCompat or Material one, and that
 * is a dependency decision rather than an oversight: taking
 * `com.google.android.material` for a bottom sheet would push Material — and a
 * required `Theme.Material3` on the host's Activity — into every app that
 * autolinks this library. It is the same restraint `@amritk/lynx-location`
 * shows in refusing Play Services for the fused location provider. The
 * framework dialog is themed by whatever the host already uses, which is the
 * thing an app actually wants.
 *
 * ## Why the title and message are a view we build
 *
 * Because `AlertDialog` will not show a message and a list at the same time,
 * and it fails at it silently. `AlertController.setupContent` only moves the
 * `ListView` into the content panel when there is **no** message to put there;
 * set both and the message appears, the rows do not, and nothing anywhere says
 * why. The bug that produces — a sheet with no actions in it, but only for the
 * callers who passed a message — is exactly the kind that ships.
 *
 * So the header goes through `setCustomTitle`, which is untouched by that path.
 * The two labels use the platform's own dialog-title and small text
 * appearances, so it reads as the dialog it is rather than as something we drew.
 */
internal object ActionSheets {
  fun present(activity: Activity, options: Map<String, Any?>, session: DialogSession) {
    val rows =
      Options.maps(options, "actions").map { entry ->
        ActionSheetRow(
          label = Options.string(entry, "label", ""),
          destructive = Options.boolean(entry, "destructive", false),
          disabled = Options.boolean(entry, "disabled", false),
        )
      }

    val builder = AlertDialog.Builder(activity)
    header(activity, Options.stringOrNull(options, "title"), Options.stringOrNull(options, "message"))?.let {
      builder.setCustomTitle(it)
    }

    // `which` is the adapter position, which is the position in the array
    // JavaScript passed — disabled rows included, because they are still rows.
    // That is what `ActionSheetResult.index` promises and it is why nothing
    // here filters the list before building the adapter.
    builder.setAdapter(ActionSheetAdapter(activity, rows)) { _, which -> session.finish(DialogResults.action(which)) }

    // A null listener is the stock "dismiss and do nothing", which is all that
    // is wanted: the dismiss listener below is what turns every way out of this
    // dialog into the one cancelled answer.
    builder.setNegativeButton(
      Options.stringOrNull(options, "cancelLabel") ?: activity.getString(android.R.string.cancel),
      null,
    )

    // `anchor` is read and ignored on purpose. It positions an iPad popover and
    // Android has no equivalent — a sheet here is centred by the window manager
    // whatever the app passes, and pretending otherwise would be worse than
    // documenting it, which `ActionSheetAnchor` does.
    val dialog = builder.create()
    dialog.setOnDismissListener { session.cancel("the action sheet was dismissed") }
    session.show(dialog)
  }

  /**
   * The title and message stacked, or null when there is neither.
   *
   * Built in code rather than from a layout resource so the library ships no
   * resources at all — one fewer thing to collide with a host app's, and one
   * fewer reason for the merged resource table to grow.
   */
  private fun header(context: Context, title: String?, message: String?): View? {
    if (title == null && message == null) return null

    val density = context.resources.displayMetrics.density
    val sides = (SIDE_PADDING_DP * density).toInt()

    val column = LinearLayout(context)
    column.orientation = LinearLayout.VERTICAL
    column.setPadding(sides, (TOP_PADDING_DP * density).toInt(), sides, (BOTTOM_PADDING_DP * density).toInt())

    title?.let { column.addView(label(context, it, android.R.style.TextAppearance_DeviceDefault_DialogWindowTitle, 0)) }
    message?.let {
      column.addView(label(context, it, android.R.style.TextAppearance_DeviceDefault_Small, (GAP_DP * density).toInt()))
    }
    return column
  }

  private fun label(context: Context, value: String, appearance: Int, topPadding: Int): TextView {
    val view = TextView(context)
    // The one-argument form, which needs API 23 — the two-argument one has been
    // deprecated since then and `check:android` fails on warnings.
    view.setTextAppearance(appearance)
    view.setPadding(0, topPadding, 0, 0)
    view.text = value
    return view
  }

  /** Matched to the framework dialog's own title padding, so the header lines up with the rows. */
  private const val SIDE_PADDING_DP = 24
  private const val TOP_PADDING_DP = 18
  private const val BOTTOM_PADDING_DP = 8
  private const val GAP_DP = 8
}
