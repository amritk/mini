package dev.amritk.minilynx.deeplinking

import android.app.Activity
import android.app.Application
import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.Bundle

/**
 * Captures the link that launched the app, with nothing asked of the host.
 *
 * A `ContentProvider` is an odd place for this and it is the standard one:
 * providers are instantiated during process startup, **before** the first
 * activity exists, which is the only hook a library gets that early without
 * asking the host app to call it. Firebase and AndroidX Startup both work this
 * way. The provider stores nothing and serves nothing — `onCreate` registering
 * the lifecycle callback is the entire purpose.
 *
 * The alternative was to require two lines in the host's activity instead of
 * one. Cold start is the case that matters most (it carries the destination the
 * user tapped) and the case a host is most likely to wire wrongly, so it is the
 * one worth spending a manifest entry to make automatic.
 *
 * What this **cannot** do is see `onNewIntent`, which is where a link arriving
 * at an already-running activity lands. There is no lifecycle callback for it
 * at any API level; that one line is `DeepLinks.handleIntent`, and the README
 * has it.
 */
internal class DeepLinkInitializer : ContentProvider() {

  override fun onCreate(): Boolean {
    val application = context?.applicationContext as? Application ?: return false
    application.registerActivityLifecycleCallbacks(Callbacks())
    return true
  }

  /**
   * The launch intent, taken from the first activity of the process.
   *
   * Every later activity is a running app, so its intent — if it has data at
   * all — is published as an ordinary link. That covers a deep link that starts
   * a *new* activity instance while the process lives, which is common and
   * would otherwise need host wiring too.
   *
   * All seven methods are implemented because all seven are abstract on the
   * interface. The six empty ones are not oversight; a class that implemented
   * only the first would not compile.
   */
  private class Callbacks : Application.ActivityLifecycleCallbacks {
    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
      DeepLinks.handleLaunchIntent(activity.intent)
    }

    override fun onActivityStarted(activity: Activity) = Unit

    override fun onActivityResumed(activity: Activity) = Unit

    override fun onActivityPaused(activity: Activity) = Unit

    override fun onActivityStopped(activity: Activity) = Unit

    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit

    override fun onActivityDestroyed(activity: Activity) = Unit
  }

  // A provider has to be a provider. Nothing is stored, nothing is queryable,
  // and every entry point answers as emptily as its signature allows.

  override fun query(
    uri: Uri,
    projection: Array<out String>?,
    selection: String?,
    selectionArgs: Array<out String>?,
    sortOrder: String?,
  ): Cursor? = null

  override fun getType(uri: Uri): String? = null

  override fun insert(uri: Uri, values: ContentValues?): Uri? = null

  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
