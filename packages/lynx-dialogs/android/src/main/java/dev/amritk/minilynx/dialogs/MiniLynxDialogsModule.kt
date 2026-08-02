package dev.amritk.minilynx.dialogs

import android.app.Activity
import android.os.Handler
import android.os.Looper
import com.lynx.jsbridge.LynxContextModule
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxNativeModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.ReadableMap
import com.lynx.tasm.behavior.LynxContext

/**
 * The Android half of `@amritk/lynx-dialogs`.
 *
 * Every method here is the other end of one function in the package's
 * TypeScript. The names, arities and call forms have to match exactly:
 * `src/testing/create-fake-dialogs.ts` is the executable statement of that
 * contract, and it is what the JavaScript suite runs against.
 *
 * `@LynxNativeModule` registers the module through Lynx's annotation processor,
 * so an app that autolinks this library gets it without writing anything. An
 * app whose build does not run the processor can register it by hand instead:
 *
 * ```kotlin
 * LynxEnv.inst().registerModule("MiniLynxDialogsModule", MiniLynxDialogsModule::class.java)
 * ```
 *
 * ## Two threads, and which work belongs to each
 *
 * A bridge call arrives on a background thread and every `Dialog` operation has
 * to happen on the UI thread — `show` from anywhere else throws, and it throws
 * from inside the view system with a stack that names none of this code. So
 * each method here does two things in two places:
 *
 * - **On the calling thread:** read the options bag, and claim the presentation
 *   slot. Reading immediately matters because a `ReadableMap` is the bridge's
 *   to reuse once the call returns; holding one across a thread hop is reading
 *   whatever the next call put there. Claiming immediately matters because it
 *   makes `busy` deterministic instead of a race between two UI-thread posts.
 * - **On the UI thread:** find an Activity, and present.
 *
 * ## No permissions, and no manifest entries
 *
 * Unlike the other native modules in this repository, showing a dialog is not a
 * capability either platform gates. Nothing is declared, so nothing appears in
 * the host app's merged manifest or on its store listing.
 */
@LynxNativeModule(name = "MiniLynxDialogsModule")
class MiniLynxDialogsModule(context: LynxContext) : LynxContextModule(context) {

  init {
    // Starts tracking the resumed Activity, which is the fallback for hosts
    // whose LynxContext does not wrap one. It registers once per process
    // however many LynxViews are built.
    DialogHost.install(context.applicationContext)
  }

  @LynxMethod
  fun presentDatePicker(options: ReadableMap?, callback: Callback) {
    present(Options.read(options), callback, DatePickers::present)
  }

  @LynxMethod
  fun presentActionSheet(options: ReadableMap?, callback: Callback) {
    present(Options.read(options), callback, ActionSheets::present)
  }

  /**
   * Closes whatever is on screen, and settles its promise as a dismissal.
   *
   * Nothing on screen is not an error — a screen unmounting cannot know whether
   * the sheet it opened is still up, which is the whole reason this exists.
   */
  @LynxMethod
  fun dismissActiveDialog() {
    val session = ActiveDialog.current() ?: return
    MAIN.post { session.dismissFromApp() }
  }

  /**
   * The half of a presentation that both methods share: claim, hop, present.
   *
   * The failure paths all end in an ordinary callback invocation rather than an
   * exception, because Lynx has no error convention for bridge callbacks and a
   * throw here would reach JavaScript as a rejected promise the facade does not
   * model. `DialogResult` is a discriminated union for exactly this reason.
   */
  private fun present(
    bag: Map<String, Any?>,
    callback: Callback,
    show: (Activity, Map<String, Any?>, DialogSession) -> Unit,
  ) {
    val session = ActiveDialog.claim(callback)
    if (session == null) {
      callback.invoke(DialogResults.failure(DialogResults.BUSY, "another dialog is already presented"))
      return
    }

    MAIN.post {
      val activity = DialogHost.current(mLynxContext)
      if (activity == null) {
        session.finish(
          DialogResults.failure(DialogResults.UNAVAILABLE, "there is no resumed activity to present a dialog from"),
        )
        return@post
      }
      // The Activity can finish between the check above and the show below, and
      // a `BadTokenException` thrown inside a posted runnable takes the app
      // down. Catching it turns the crash into the `unavailable` answer the
      // caller already knows how to read.
      runCatching { show(activity, bag, session) }
        .onFailure { error ->
          session.finish(
            DialogResults.failure(DialogResults.UNAVAILABLE, error.message ?: "the dialog could not be presented"),
          )
        }
    }
  }

  companion object {
    /**
     * Every dialog operation goes through here. A `Dialog` shown from any other
     * thread throws from inside the view system, with a stack that names none
     * of this package's code.
     */
    private val MAIN = Handler(Looper.getMainLooper())
  }
}
