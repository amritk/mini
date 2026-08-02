package dev.amritk.minilynx.location

import android.location.Location
import android.location.LocationListener
import android.os.Bundle

/**
 * A running watch: every fix it produces goes out as an event under its id.
 *
 * Unlike `SingleFixListener` this one never removes itself. It runs until
 * JavaScript calls `stopWatching`, which is the bargain `watchPosition`
 * documents — a watch holds a location provider open, and only the app knows
 * when it is finished with it.
 */
internal class WatchListener(private val watchId: String) : LocationListener {
  override fun onLocationChanged(location: Location) {
    LocationEvents.position(watchId, LocationFixes.toPayload(location))
  }

  override fun onProviderDisabled(provider: String) {
    // Reported, not fatal. The user can switch location back on and this same
    // listener starts producing again, so tearing the watch down here would
    // turn a recoverable interruption into a permanent one.
    LocationEvents.error(watchId, LocationEvents.LOCATION_DISABLED, "$provider was switched off")
  }

  override fun onProviderEnabled(provider: String) {}

  // Removed from the interface in API 30 but still abstract on every device
  // below it, so it has to be implemented or those devices throw
  // AbstractMethodError the first time a provider changes state.
  @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
  override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
}
