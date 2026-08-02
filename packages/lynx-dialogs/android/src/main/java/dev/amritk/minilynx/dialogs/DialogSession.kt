package dev.amritk.minilynx.dialogs

import android.app.Dialog
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import java.util.concurrent.atomic.AtomicBoolean

/**
 * One presentation: the dialog on screen, and the single answer it owes
 * JavaScript.
 *
 * ## Exactly one answer, and why that needs enforcing
 *
 * Invoking a Lynx `Callback` twice is not recoverable on the other side — the
 * promise has already settled and the second value is dropped with no error —
 * and a dialog offers several routes to an answer that can all fire for the
 * same interaction. Tapping a row dismisses the dialog, so the click listener
 * and the dismiss listener both run. The back gesture fires cancel *and*
 * dismiss. `dismissActiveDialog` closes a dialog whose own listeners then run
 * anyway.
 *
 * So every route funnels through `finish`, guarded by an atomic flag, and the
 * first one to arrive is the answer. That makes the listeners simple to write:
 * each one says what it means and none of them has to know which others exist.
 * It is the same bargain `SingleFixListener` makes in `@amritk/lynx-location`,
 * for the same reason.
 *
 * ## Why the dialog is held at all
 *
 * So `dismissActiveDialog` has something to close. A dialog belongs to the
 * Activity's window rather than to the Lynx view, and nothing tears it down
 * when the component that opened it navigates away.
 */
internal class DialogSession(private val callback: Callback) {
  private val answered = AtomicBoolean(false)

  /**
   * Written from the UI thread and read from `dismissActiveDialog`'s post, and
   * swapped mid-session by the `datetime` flow when the date step hands over to
   * the time step.
   */
  @Volatile
  private var dialog: Dialog? = null

  /** Puts a dialog on screen and makes it the one this session owns. */
  fun show(next: Dialog) {
    dialog = next
    next.show()
  }

  /** Settles this presentation. The first call wins; every later one is a no-op. */
  fun finish(result: JavaOnlyMap) {
    if (!answered.compareAndSet(false, true)) return
    // Released before the callback runs, because a caller may present again the
    // instant its promise settles — and a slot still holding this finished
    // session would refuse that one as `busy`.
    ActiveDialog.release(this)
    dialog = null
    callback.invoke(result)
  }

  fun cancel(message: String) = finish(DialogResults.failure(DialogResults.DISMISSED, message))

  /**
   * Closes the dialog on the app's behalf and settles as a dismissal.
   *
   * The answer is recorded straight after asking the dialog to close rather
   * than waiting for its dismiss listener: `Dialog.dismiss` posts its listeners
   * rather than running them inline, so answering here is what gets the app's
   * own wording onto the result instead of the user-cancelled one that would
   * otherwise arrive a moment later. Either way the guard above means only one
   * of them lands.
   */
  fun dismissFromApp() {
    runCatching { dialog?.dismiss() }
    cancel("dismissed by the app")
  }
}
