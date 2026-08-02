package dev.amritk.minilynx.dialogs

import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.TextView

/** One row, as it arrived from JavaScript. */
internal data class ActionSheetRow(val label: String, val destructive: Boolean, val disabled: Boolean)

/**
 * The sheet's rows, with the two states `AlertDialog.setItems` cannot express.
 *
 * `setItems` takes an array of strings and gives every one of them the same
 * appearance and the same tappability, so a destructive row and a disabled row
 * are both impossible with it. An adapter is the smallest step up that gets
 * them: `ListView` asks `isEnabled` before letting a row be chosen, and
 * `getView` is where a colour can differ per row.
 *
 * Everything else is left to the platform. The layout is
 * `android.R.layout.select_dialog_item`, which is the one `AlertDialog` uses
 * itself, so a sheet from this package sits at the same metrics and text
 * appearance as one from anywhere else in the system — including on whatever
 * OEM theme the device is wearing, which is not something a hand-built row
 * could keep up with.
 */
internal class ActionSheetAdapter(private val context: Context, private val rows: List<ActionSheetRow>) : BaseAdapter() {

  /**
   * The theme's own row colour, captured from the first row inflated.
   *
   * Read off a fresh view rather than resolved from an attribute because it has
   * to be the colour this exact layout would have had. It cannot be read from a
   * recycled view — by then `getView` has already overwritten it — so the very
   * first inflation is the only chance to see it.
   */
  private var themeColor: Int? = null

  override fun getCount(): Int = rows.size

  override fun getItem(position: Int): Any = rows[position]

  override fun getItemId(position: Int): Long = position.toLong()

  /**
   * Both of these are what actually stop a disabled row being chosen.
   *
   * `ListView` consults them before it will select a row, so a disabled row
   * cannot produce a click and therefore cannot produce a result — which is the
   * promise `ActionSheetItem.disabled` makes on the JavaScript side. Greying
   * the text without these would be a row that looks unavailable and works.
   */
  override fun areAllItemsEnabled(): Boolean = rows.none { it.disabled }

  override fun isEnabled(position: Int): Boolean = !rows[position].disabled

  override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
    val view =
      convertView as? TextView
        ?: (LayoutInflater.from(context).inflate(android.R.layout.select_dialog_item, parent, false) as TextView)
            .also { if (themeColor == null) themeColor = it.currentTextColor }

    val row = rows[position]
    view.text = row.label
    view.isEnabled = !row.disabled

    // Android has no destructive style for a list row, so this is the one place
    // the package picks a colour rather than taking the platform's. The system
    // red is used rather than a literal, so it tracks the device's own idea of
    // what a dangerous action looks like.
    val base =
      if (row.destructive) context.getColor(android.R.color.holo_red_dark)
      else themeColor ?: view.currentTextColor
    view.setTextColor(if (row.disabled) (base and RGB) or DISABLED_ALPHA else base)
    return view
  }

  private companion object {
    /** Strips the alpha byte so a fresh one can be put in its place. */
    const val RGB = 0x00FFFFFF

    /** 38%, which is what both platforms use for text that is present but unavailable. */
    const val DISABLED_ALPHA = 0x61000000
  }
}
