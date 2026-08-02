package dev.amritk.minilynx.notifications

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle

/**
 * A screen the user never sees, whose only job is to own a permission result.
 *
 * `ActivityCompat.requestPermissions` delivers its answer to an Activity's
 * `onRequestPermissionsResult`, and a native module is not an Activity. The
 * alternatives are worse: asking the host app to forward the callback couples
 * every consumer to this library's internals, and returning "ask again later"
 * turns a one-shot system prompt into a guess.
 *
 * So this is a transparent, recents-excluded Activity that requests the
 * permission, hands the result to the waiting callback, and finishes. From the
 * user's side there is a system dialog and nothing else.
 */
internal class NotificationPermissionActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Below Android 13 there is no runtime permission: notifications are
    // granted at install, so there is nothing to ask and asking would hang.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      finishWith(true)
      return
    }
    // Recorded before the prompt rather than after it, because the user can
    // dismiss the dialog by swiping it away — which delivers no result at all,
    // and would otherwise leave the app thinking it had never asked.
    NotificationPermissionState.markAsked(this)
    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_CODE)
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != REQUEST_CODE) return
    finishWith(grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED)
  }

  private fun finishWith(granted: Boolean) {
    val callback = takePending()
    finish()
    // No transition: a flash of a blank translucent activity is the one visual
    // artefact this approach can produce, and this removes it.
    overridePendingTransition(0, 0)
    callback?.invoke(granted)
  }

  companion object {
    private const val REQUEST_CODE = 0x11C5

    /**
     * The waiting caller. A single slot rather than a queue because the system
     * shows one permission dialog at a time regardless; a second request while
     * one is in flight replaces the first, which is what would have happened to
     * its dialog anyway.
     */
    private var pending: ((Boolean) -> Unit)? = null

    @Synchronized
    private fun takePending(): ((Boolean) -> Unit)? {
      val callback = pending
      pending = null
      return callback
    }

    @Synchronized
    fun request(context: Context, onResult: (Boolean) -> Unit) {
      pending = onResult
      val intent = Intent(context, NotificationPermissionActivity::class.java)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      intent.addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION)
      context.applicationContext.startActivity(intent)
    }
  }
}
