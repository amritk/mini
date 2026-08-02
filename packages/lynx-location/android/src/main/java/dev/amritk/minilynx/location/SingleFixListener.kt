package dev.amritk.minilynx.location

import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import java.util.concurrent.atomic.AtomicBoolean

/**
 * One fix, or one reason there was not one, and then it is done.
 *
 * `LocationManager` has no one-shot request that works across the versions this
 * library supports — `getCurrentLocation` is API 30 and `requestSingleUpdate`
 * was deprecated at the same time — so a single fix is a continuous request
 * that removes itself the moment it has an answer. Forgetting that removal is
 * how a "get my position once" button leaves a GPS provider running for the
 * rest of the session.
 *
 * ## Exactly one answer reaches JavaScript
 *
 * Invoking a Lynx `Callback` twice is not a recoverable mistake on the other
 * side — the promise it settles is already gone, and what the second invocation
 * does is undefined. Three things race to answer here (a fix, a provider
 * switching off, and the timeout elapsing), so the winner is decided by an
 * atomic flag rather than by hoping they do not overlap.
 */
internal class SingleFixListener(
  private val manager: LocationManager,
  private val callback: Callback,
  private val timeoutMs: Long,
) : LocationListener {
  private val handler = Handler(Looper.getMainLooper())
  private val answered = AtomicBoolean(false)

  private val expire =
    Runnable { finish(LocationResults.failure(LocationEvents.TIMEOUT, "no fix within ${timeoutMs}ms")) }

  /**
   * Starts the clock. Called after `requestLocationUpdates` has been accepted,
   * so a request that was rejected outright never arms a timer nothing will
   * cancel.
   */
  fun arm() {
    handler.postDelayed(expire, timeoutMs)
  }

  /** Answers with a failure and stops listening, for a request that never started. */
  fun abandon(code: String, message: String) {
    finish(LocationResults.failure(code, message))
  }

  override fun onLocationChanged(location: Location) {
    finish(LocationResults.success(location))
  }

  override fun onProviderDisabled(provider: String) {
    // The user reached the quick settings tile while we were waiting. Reporting
    // this immediately is better than letting the timeout run: the app can say
    // what actually happened instead of "we could not get a fix".
    finish(LocationResults.failure(LocationEvents.LOCATION_DISABLED, "$provider was switched off"))
  }

  override fun onProviderEnabled(provider: String) {}

  // Removed from the interface in API 30 but still abstract on every device
  // below it, so it has to be implemented or those devices throw
  // AbstractMethodError the first time a provider changes state.
  @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
  override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}

  private fun finish(result: JavaOnlyMap) {
    if (!answered.compareAndSet(false, true)) return
    handler.removeCallbacks(expire)
    // A removal can throw if the permission was revoked while we waited, which
    // is not worth failing an answer we already have.
    runCatching { manager.removeUpdates(this) }
    callback.invoke(result)
  }
}
