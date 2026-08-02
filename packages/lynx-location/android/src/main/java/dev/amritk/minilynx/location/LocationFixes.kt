package dev.amritk.minilynx.location

import android.location.Location
import android.location.LocationManager
import android.os.Build
import com.lynx.react.bridge.JavaOnlyMap

/**
 * Turning an Android `Location` into the payload `LocationFix` describes, and
 * choosing which provider to ask.
 *
 * ## Why `LocationManager` and not the fused provider
 *
 * `FusedLocationProviderClient` is better at this — it blends the providers,
 * batches, and is easier on the battery — and it lives in
 * `com.google.android.gms:play-services-location`. Taking that dependency would
 * push Play Services into every host app that autolinks this library and lock
 * out the devices that do not have it. `LocationManager` is in the platform,
 * works everywhere, and is what a library with no idea what it is being
 * installed into can safely assume. An app that wants fused location wants its
 * own module, and can have one.
 */
internal object LocationFixes {
  /**
   * The providers to try, best first, for each accuracy level.
   *
   * `PASSIVE_PROVIDER` never powers anything up: it delivers whatever another
   * app has already asked for, which is exactly what `low` promises and exactly
   * why it may deliver nothing at all on an idle device.
   */
  private fun preferenceFor(accuracy: String): List<String> =
    when (accuracy) {
      "high" -> listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
      "low" -> listOf(LocationManager.PASSIVE_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
      else -> listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER, LocationManager.PASSIVE_PROVIDER)
    }

  /** The best enabled provider for [accuracy], or null when the device has none. */
  fun providerFor(manager: LocationManager, accuracy: String): String? =
    preferenceFor(accuracy).firstOrNull { isEnabled(manager, it) }

  /**
   * Whether location is usable device-wide.
   *
   * Android 28 added a direct answer. Below that the question has to be asked
   * of the providers one at a time, which is not quite the same thing — a
   * device with every provider off is indistinguishable from one with location
   * switched off, and for an app's purposes those are the same problem anyway.
   */
  fun isLocationEnabled(manager: LocationManager): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      manager.isLocationEnabled
    } else {
      isEnabled(manager, LocationManager.GPS_PROVIDER) || isEnabled(manager, LocationManager.NETWORK_PROVIDER)
    }

  /**
   * `isProviderEnabled` throws for a provider the device does not have, and
   * which providers exist varies by manufacturer — so the absence of one is
   * read as "not available" rather than allowed to fail the call.
   */
  private fun isEnabled(manager: LocationManager, provider: String): Boolean =
    runCatching { manager.isProviderEnabled(provider) }.getOrDefault(false)

  /**
   * The most recent fix any provider has, or null.
   *
   * Every provider is asked and the newest answer wins, because the one with
   * the best accuracy is frequently the one that has not run for a day.
   */
  fun lastKnown(manager: LocationManager): Location? =
    runCatching { manager.allProviders }
      .getOrDefault(emptyList())
      .mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
      .maxByOrNull { it.time }

  /**
   * The wire shape of one fix.
   *
   * Every optional field is written explicitly as null rather than left out:
   * the bridge maps an absent key to `undefined` on the JavaScript side, and
   * `LocationFix` says these are `null`. Two spellings of "no value" in one
   * payload is how a strict-null consumer ends up with a type that lies.
   */
  fun toPayload(location: Location): JavaOnlyMap {
    val payload = JavaOnlyMap()
    payload.putDouble("latitude", location.latitude)
    payload.putDouble("longitude", location.longitude)

    if (location.hasAccuracy()) payload.putDouble("accuracy", location.accuracy.toDouble())
    else payload.putNull("accuracy")

    if (location.hasAltitude()) payload.putDouble("altitude", location.altitude) else payload.putNull("altitude")

    // Vertical accuracy arrived in API 26. Below that the field is not merely
    // absent from the fix, it does not exist on the class.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasVerticalAccuracy()) {
      payload.putDouble("altitudeAccuracy", location.verticalAccuracyMeters.toDouble())
    } else {
      payload.putNull("altitudeAccuracy")
    }

    if (location.hasSpeed()) payload.putDouble("speed", location.speed.toDouble()) else payload.putNull("speed")

    // Bearing is course over ground, so a stationary device reports none. That
    // is a null rather than a zero, which would read as "due north".
    if (location.hasBearing()) payload.putDouble("heading", location.bearing.toDouble())
    else payload.putNull("heading")

    // `Location.getTime` is already epoch milliseconds, and goes across as a
    // double because that is the only number JavaScript has. It is exact well
    // past any date this code will see.
    payload.putDouble("timestamp", location.time.toDouble())
    return payload
  }
}
