package dev.amritk.minilynx.location

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
 * `requestPermissions` delivers its answer to an Activity's
 * `onRequestPermissionsResult`, and a native module is not an Activity. The
 * alternatives are worse: asking the host app to forward the callback couples
 * every consumer to this library's internals, and returning "ask again later"
 * turns a one-shot system prompt into a guess.
 *
 * So this is a transparent, recents-excluded Activity that requests the
 * permission, hands the result to the waiting callback, and finishes. From the
 * user's side there is a system dialog and nothing else.
 *
 * This is the same mechanism `@amritk/lynx-notifications` uses for
 * `POST_NOTIFICATIONS`, deliberately duplicated rather than shared: the two
 * packages are published independently and an app may install either alone.
 */
internal class LocationPermissionActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Recorded before the prompt rather than after it, because the user can
    // dismiss the dialog by swiping it away — which delivers no result at all,
    // and would otherwise leave the app thinking it had never asked.
    LocationPermissionState.markAsked(this)

    val precise = intent?.getBooleanExtra(EXTRA_PRECISE, true) ?: true
    // Asking for FINE also offers the user the approximate option — Android 12
    // put both in one dialog and lets them pick the weaker one. Asking for
    // COARSE alone offers no such upgrade, so `precise: false` really is a
    // decision to never have a precise fix rather than a starting position.
    val permissions =
      if (precise) {
        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
      } else {
        arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION)
      }
    requestPermissions(permissions, REQUEST_CODE)
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode != REQUEST_CODE) return
    // Either permission being granted is a grant: a user who chose "Approximate"
    // in response to a precise request has said yes, and reporting that as a
    // denial would send the app down the "explain and link to settings" path
    // for a decision the user already made on purpose.
    finishWith(grantResults.any { it == PackageManager.PERMISSION_GRANTED })
  }

  private fun finishWith(granted: Boolean) {
    val callback = takePending()
    finish()
    // No transition: a flash of a blank translucent activity is the one visual
    // artefact this approach can produce, and this removes it. Android 34
    // replaced `overridePendingTransition` with a form that names which
    // transition is being overridden, and deprecated the old one.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, 0)
    } else {
      @Suppress("DEPRECATION")
      overridePendingTransition(0, 0)
    }
    callback?.invoke(granted)
  }

  companion object {
    private const val REQUEST_CODE = 0x10C8
    private const val EXTRA_PRECISE = "precise"

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
    fun request(context: Context, precise: Boolean, onResult: (Boolean) -> Unit) {
      pending = onResult
      val intent = Intent(context, LocationPermissionActivity::class.java)
      intent.putExtra(EXTRA_PRECISE, precise)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      intent.addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION)
      context.applicationContext.startActivity(intent)
    }
  }
}
