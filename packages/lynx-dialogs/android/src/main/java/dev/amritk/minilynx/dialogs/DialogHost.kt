package dev.amritk.minilynx.dialogs

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.ContextWrapper
import android.os.Bundle
import java.lang.ref.WeakReference

/**
 * Finding an Activity to put a dialog on.
 *
 * This is the whole Android difficulty of this package. A `Dialog` needs a
 * **window token**, which only an Activity has: built on an application context
 * it throws `BadTokenException` the moment it is shown, and it throws at show
 * time rather than at construction, so the mistake survives every check that
 * looks like it should have caught it. `LynxContextModule` hands out
 * `applicationContext`, which is exactly the context that cannot work.
 *
 * Two ways to find a real one, in this order:
 *
 * 1. **Unwrap the LynxContext.** A LynxView is usually built by an Activity, so
 *    the context chain often ends at one. When it does this is the right
 *    answer, because it is the Activity that owns the view the user is looking
 *    at — which on a device with more than one is the difference between the
 *    dialog appearing and the dialog appearing somewhere else.
 * 2. **The last resumed Activity.** Registered once against the Application, it
 *    covers every host that builds its LynxView from something other than an
 *    Activity — a Service, an application-scoped factory, a Compose host — and
 *    those exist.
 *
 * Both are held weakly and both are re-checked for `isFinishing` and
 * `isDestroyed` at the moment of use, because a dialog is presented one thread
 * hop after it was asked for and an Activity can go away inside it.
 */
internal object DialogHost {
  private var tracked: WeakReference<Activity>? = null
  private var installed = false

  /**
   * Starts tracking the resumed Activity. Safe to call on every module
   * instance — a module is created per LynxView and the callbacks only want
   * registering once per process.
   */
  @Synchronized
  fun install(context: Context) {
    if (installed) return
    val application = context.applicationContext as? Application ?: return
    application.registerActivityLifecycleCallbacks(Callbacks)
    installed = true
  }

  /**
   * An Activity that can host a dialog right now, or null.
   *
   * Null is a real answer rather than a failure to look properly: an app in the
   * background genuinely has nowhere to put a dialog, and reporting
   * `unavailable` is better than queueing one to appear over whatever the user
   * returns to.
   */
  fun current(context: Context?): Activity? {
    val direct = unwrap(context)
    if (direct != null && usable(direct)) return direct
    val remembered = synchronized(this) { tracked?.get() }
    return if (remembered != null && usable(remembered)) remembered else null
  }

  @Synchronized
  fun remember(activity: Activity) {
    tracked = WeakReference(activity)
  }

  @Synchronized
  fun forget(activity: Activity) {
    if (tracked?.get() === activity) tracked = null
  }

  private fun usable(activity: Activity): Boolean = !activity.isFinishing && !activity.isDestroyed

  /**
   * Walks the `ContextWrapper` chain looking for an Activity.
   *
   * `LynxContext` is itself a wrapper, and what it wraps depends on how the
   * host built the view — so this follows `baseContext` down rather than
   * testing one level and giving up.
   */
  private fun unwrap(context: Context?): Activity? {
    var candidate = context
    while (candidate is ContextWrapper) {
      if (candidate is Activity) return candidate
      candidate = candidate.baseContext
    }
    return null
  }

  /**
   * All seven methods are implemented, and they have to be.
   *
   * `Application.ActivityLifecycleCallbacks` gained default methods for the
   * `Pre`/`Post` variants in API 29, but these seven have been abstract since
   * API 14 and still are — an object implementing only the two that matter here
   * does not compile, and would not run if it did.
   */
  private object Callbacks : Application.ActivityLifecycleCallbacks {
    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit

    override fun onActivityStarted(activity: Activity) = Unit

    override fun onActivityResumed(activity: Activity) = remember(activity)

    override fun onActivityPaused(activity: Activity) = Unit

    override fun onActivityStopped(activity: Activity) = Unit

    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit

    override fun onActivityDestroyed(activity: Activity) = forget(activity)
  }
}
