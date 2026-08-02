package dev.amritk.minilynx.deeplinking

import com.lynx.jsbridge.LynxContextModule
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxNativeModule
import com.lynx.react.bridge.Callback
import com.lynx.tasm.behavior.LynxContext

/**
 * The Android half of `@amritk/lynx-deep-linking`.
 *
 * Every method here is the other end of one function in the package's
 * TypeScript. The names, arities and call forms have to match exactly:
 * `src/testing/create-fake-deep-linking.ts` is the executable statement of that
 * contract, and it is what the JavaScript suite runs against.
 *
 * `@LynxNativeModule` registers the module through Lynx's annotation processor,
 * so an app that autolinks this library gets it without writing anything. An
 * app whose build does not run the processor can register it by hand instead:
 *
 * ```kotlin
 * LynxEnv.inst().registerModule("MiniLynxDeepLinkingModule", MiniLynxDeepLinkingModule::class.java)
 * ```
 *
 * ## The inbound direction is not here
 *
 * Nothing in this class receives a link. Intents arrive at an activity, long
 * before any LynxView exists and on a lifecycle this module cannot see, so
 * `DeepLinks` owns the entry points and `DeepLinkEvents` owns the fan-out. This
 * is only the JavaScript-facing surface: three questions and one flush.
 */
@LynxNativeModule(name = "MiniLynxDeepLinkingModule")
class MiniLynxDeepLinkingModule(context: LynxContext) : LynxContextModule(context) {

  init {
    // The context is what `sendGlobalEvent` needs, and a module instance is
    // per-LynxView, so registering here is what lets links reach every view
    // that is up rather than whichever one happened to be built last.
    DeepLinkEvents.register(context)
  }

  @LynxMethod
  fun getInitialURL(callback: Callback) {
    val url = DeepLinks.initialURL()
    if (url == null) callback.invoke(*NO_URL) else callback.invoke(url)
  }

  /**
   * Replays a link that arrived with no view to receive it.
   *
   * Returning rather than callback-shaped: there is nothing to wait for, and
   * the facade calls it through `callNative` immediately after subscribing —
   * being asked is the only reliable signal that JavaScript is listening. See
   * `DeepLinkEvents`.
   */
  @LynxMethod
  fun flushPendingLink() {
    DeepLinkEvents.flushPendingLink()
  }

  @LynxMethod
  fun openURL(url: String, callback: Callback) {
    callback.invoke(SystemLinks.open(mLynxContext.applicationContext, url))
  }

  @LynxMethod
  fun canOpenURL(url: String, callback: Callback) {
    callback.invoke(SystemLinks.canOpen(mLynxContext.applicationContext, url))
  }

  @LynxMethod
  fun openSettings(callback: Callback) {
    callback.invoke(SystemLinks.openSettings(mLynxContext.applicationContext))
  }

  companion object {
    /**
     * `Callback.invoke` takes `Object...`, and a bare Kotlin `null` there is
     * read as a null *array* rather than as one null argument. A pre-built
     * single-null array is the unambiguous spelling — and `getInitialURL` is
     * typed `string | null`, so the difference between a null and an absent
     * argument is the difference between `null` and `undefined` on the other
     * side.
     */
    private val NO_URL = arrayOfNulls<Any>(1)
  }
}
