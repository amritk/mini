package dev.amritk.minilynx.notifications

import android.content.Context

/**
 * Whether this app has ever shown the notifications permission prompt.
 *
 * Android has no API for "has the user been asked yet". It can tell you whether
 * the permission is granted, and `shouldShowRequestPermissionRationale` tells
 * you something adjacent but not this — it returns false both before the first
 * ask and after a permanent denial, which are the two states that most need
 * telling apart.
 *
 * Without the distinction, an app cannot tell `undetermined` from `denied`, and
 * the usual consequence is prompting on every launch: the request shows nothing
 * because the user already refused, the app reads "not granted", and it tries
 * again next time. So the fact is recorded on the way out of the prompt.
 */
internal object NotificationPermissionState {
  private const val PREFS = "mini-lynx-notifications"
  private const val KEY_ASKED = "permission-asked"

  fun hasBeenAsked(context: Context): Boolean =
    context.applicationContext
      .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getBoolean(KEY_ASKED, false)

  fun markAsked(context: Context) {
    context.applicationContext
      .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_ASKED, true)
      .apply()
  }
}
