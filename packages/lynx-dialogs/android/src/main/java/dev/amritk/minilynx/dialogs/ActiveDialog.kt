package dev.amritk.minilynx.dialogs

import com.lynx.react.bridge.Callback

/**
 * The one presentation slot, for the whole process.
 *
 * Per process rather than per module instance, for the reason
 * `@amritk/lynx-location` holds its watches that way: a module is created per
 * LynxView, and nothing guarantees that the instance serving
 * `dismissActiveDialog` is the one that served the presentation. A dialog that
 * could not be dismissed is a dialog the user has to close by hand over a
 * screen that has already moved on.
 *
 * It is also what makes "one dialog at a time" mean anything. Two LynxViews in
 * the same app share one window, so a per-view slot would let each of them put
 * a sheet up and hand the user two.
 */
internal object ActiveDialog {
  private var session: DialogSession? = null

  /**
   * Claims the slot for a new presentation, or returns null when one is already
   * up.
   *
   * Called on the bridge's thread rather than the UI thread, deliberately: the
   * caller gets a `busy` answer immediately and deterministically, instead of
   * two presentations racing to a UI-thread post and the loser's outcome
   * depending on scheduling.
   */
  @Synchronized
  fun claim(callback: Callback): DialogSession? {
    if (session != null) return null
    val next = DialogSession(callback)
    session = next
    return next
  }

  /** Frees the slot, but only for the session that holds it. */
  @Synchronized
  fun release(finished: DialogSession) {
    if (session === finished) session = null
  }

  @Synchronized
  fun current(): DialogSession? = session
}
