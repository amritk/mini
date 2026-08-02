package dev.amritk.minilynx.deeplinking

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.lynx.react.bridge.JavaOnlyMap

/**
 * The outbound direction: handing a URL to whatever else is on the device.
 *
 * ## Everything here is subject to package visibility
 *
 * Android 11 stopped letting an app see what else is installed. `resolveActivity`
 * answers null and `startActivity` throws `ActivityNotFoundException` for an app
 * that is right there on the device, unless the *host* app declared the scheme
 * in a `<queries>` element. This library's manifest declares the four every app
 * uses — `https`, `mailto`, `tel`, `sms` — and merging brings them into the
 * host; anything beyond that is a declaration only the host app can make, since
 * it is a statement about what that app wants to reach.
 *
 * So a `noHandler` here means "this app cannot see a handler", which is a
 * different sentence from "the user does not have one" and the reason
 * `OpenErrorCode` documents it at length on the JavaScript side.
 */
internal object SystemLinks {

  /** Hands a URL to the system, as an `OpenResult`. */
  fun open(context: Context, url: String): JavaOnlyMap {
    val uri = parse(url) ?: return OpenResults.failure(DeepLinkEvents.INVALID_URL, "not a URL: $url")

    val intent = Intent(Intent.ACTION_VIEW, uri)
    // Mandatory: this starts from the application context, which has no task of
    // its own to launch an activity into.
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    return try {
      context.startActivity(intent)
      OpenResults.success()
    } catch (error: ActivityNotFoundException) {
      OpenResults.failure(DeepLinkEvents.NO_HANDLER, error.message ?: "nothing handles $url")
    } catch (error: SecurityException) {
      // The handler exists but will not take a call from here — an activity
      // that is not exported, or a permission it demands.
      OpenResults.failure(DeepLinkEvents.UNAVAILABLE, error.message ?: "not allowed to open $url")
    }
  }

  /**
   * Whether anything visible to this app claims the URL.
   *
   * `Intent.resolveActivity` rather than `PackageManager.resolveActivity`: it
   * asks the same question and is not the overload API 33 deprecated, so there
   * is no version fork and no suppressed warning to keep honest.
   */
  fun canOpen(context: Context, url: String): Boolean {
    val uri = parse(url) ?: return false
    val intent = Intent(Intent.ACTION_VIEW, uri)
    return intent.resolveActivity(context.packageManager) != null
  }

  /**
   * Opens this app's page in the system settings.
   *
   * `ACTION_APPLICATION_DETAILS_SETTINGS` is the only supported destination.
   * The `Uri` is built with `fromParts` rather than parsed from a string
   * because a package name is opaque scheme-specific data, and a package
   * containing anything the URI grammar treats as structure would otherwise be
   * mangled.
   */
  fun openSettings(context: Context): Boolean {
    val intent = Intent(
      Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
      Uri.fromParts("package", context.packageName, null),
    )
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
      context.startActivity(intent)
      true
    } catch (error: ActivityNotFoundException) {
      // Every device has this screen; a device without one is a custom ROM, and
      // reporting false lets the app say so rather than crash.
      false
    }
  }

  /** A URL with a scheme, or null. A string with no scheme is not routable by anything. */
  private fun parse(url: String): Uri? {
    val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return null
    return if (uri.scheme.isNullOrEmpty()) null else uri
  }
}
