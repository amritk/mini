package dev.amritk.minilynx.location

import android.content.Context
import android.location.Address
import android.location.Geocoder
import android.os.Build
import com.lynx.react.bridge.JavaOnlyMap
import java.io.IOException
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Turning coordinates into the addresses `GeocodeAddress` describes.
 *
 * ## Two APIs for one call
 *
 * Android 33 deprecated the blocking `getFromLocation` and added a callback
 * form, and this library supports devices well below that — so both are here,
 * chosen by version at the call site. They fail differently, which is the part
 * worth knowing: the callback form reports a failure as a message string
 * through `onError`, and the blocking form throws `IOException`. Both end up as
 * `network`, because from JavaScript's side they are the same problem.
 *
 * The blocking form is run on an executor rather than on the calling thread.
 * A Lynx bridge call does not arrive on the main thread today, but "today" is
 * doing a lot of work in that sentence, and a network round trip on the main
 * thread is an ANR rather than a slow frame.
 *
 * ## Why there is no geocoder cache here
 *
 * Because the sensible key is rounded coordinates and the sensible lifetime is
 * the app's, and a library that guessed at either would be wrong for somebody.
 * `reverse-geocode.ts` says so on the JavaScript side, where an app can see it.
 */
internal object Geocoding {
  /**
   * One background thread, shared by every blocking lookup.
   *
   * Geocoding is rare and slow, so a pool would mostly hold idle threads; a
   * single thread also means two lookups queue rather than racing a service
   * that rate-limits either way.
   */
  private val EXECUTOR = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "mini-lynx-geocoding").apply { isDaemon = true }
  }

  /** Whether this device has a geocoding backend at all. */
  fun isPresent(): Boolean = Geocoder.isPresent()

  /**
   * Whether these are coordinates a geocoder can be asked about.
   *
   * Checked here rather than left to the platform because the platform's two
   * answers are both bad: the blocking form throws `IllegalArgumentException`,
   * and the callback form on some implementations simply never calls back.
   * `src/testing/create-fake-location.ts` runs the same check, and so does the
   * iOS half.
   */
  fun isValid(latitude: Double?, longitude: Double?): Boolean =
    latitude != null &&
      longitude != null &&
      !latitude.isNaN() &&
      !longitude.isNaN() &&
      latitude >= -90.0 &&
      latitude <= 90.0 &&
      longitude >= -180.0 &&
      longitude <= 180.0

  /**
   * Looks up [latitude] and [longitude], and hands the result to [onResult]
   * exactly once.
   *
   * [onResult] receives the finished `GeocodeResult` envelope rather than a
   * list, so that the two version paths cannot disagree about what an empty
   * answer means.
   */
  fun reverseGeocode(
    context: Context,
    latitude: Double,
    longitude: Double,
    localeTag: String?,
    maxResults: Int,
    onResult: (JavaOnlyMap) -> Unit,
  ) {
    val geocoder = geocoderFor(context, localeTag)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      geocoder.getFromLocation(
        latitude,
        longitude,
        maxResults,
        object : Geocoder.GeocodeListener {
          override fun onGeocode(addresses: MutableList<Address>) {
            onResult(GeocodeResults.of(addresses))
          }

          override fun onError(errorMessage: String?) {
            // The callback form does not say what went wrong beyond a string,
            // and in practice the string is about the backend being
            // unreachable. `network` is the honest reading of it.
            onResult(GeocodeResults.failure(LocationEvents.NETWORK, errorMessage ?: "the geocoder reported an error"))
          }
        },
      )
      return
    }

    EXECUTOR.execute {
      try {
        @Suppress("DEPRECATION")
        val addresses = geocoder.getFromLocation(latitude, longitude, maxResults)
        onResult(GeocodeResults.of(addresses ?: emptyList()))
      } catch (error: IOException) {
        onResult(GeocodeResults.failure(LocationEvents.NETWORK, error.message ?: "could not reach the geocoding service"))
      }
    }
  }

  /**
   * A geocoder that answers in [localeTag]'s language, or in the device's when
   * there is none.
   *
   * `Locale.forLanguageTag` returns a Locale with an empty language for a tag
   * it cannot parse rather than throwing, so a typo would silently produce
   * addresses in whatever the backend defaults to. Falling back to the default
   * locale on an empty language keeps a malformed tag from being worse than no
   * tag at all.
   */
  private fun geocoderFor(context: Context, localeTag: String?): Geocoder {
    if (localeTag.isNullOrBlank()) return Geocoder(context)
    val locale = Locale.forLanguageTag(localeTag)
    return if (locale.language.isEmpty()) Geocoder(context) else Geocoder(context, locale)
  }

  /**
   * Writes [value] under [key], or an explicit null.
   *
   * Explicit for the reason `LocationFixes.toPayload` is: the bridge maps an
   * absent key to `undefined` on the JavaScript side and `GeocodeAddress` says
   * every one of these is `null`, so leaving a key out would give a strict-null
   * consumer a type that lies.
   *
   * Blank is treated as absent because Android's `Address` reports an unknown
   * component as an empty string about as often as it reports it as null, and
   * the iOS half already collapses the two. A `city` of `""` is not something a
   * caller should have to defend against on one platform only.
   */
  private fun putStringOrNull(payload: JavaOnlyMap, key: String, value: String?) {
    if (value.isNullOrBlank()) payload.putNull(key) else payload.putString(key, value)
  }

  /** One `Address`, as the payload `GeocodeAddress` describes. */
  fun toPayload(address: Address): JavaOnlyMap {
    val payload = JavaOnlyMap()
    // `getAddressLine(0)` is the platform's own formatting for that country,
    // which is the whole reason `formattedAddress` exists rather than being
    // assembled from the fields below. It throws on an address with no lines,
    // so the count is checked first.
    val formatted = if (address.maxAddressLineIndex >= 0) address.getAddressLine(0) else null
    putStringOrNull(payload, "formattedAddress", formatted)
    // Android's `featureName` is a landmark or business name when there is one
    // and frequently the house number when there is not, which is looser than
    // CoreLocation's `name`. Passed through rather than filtered: a caller
    // reading `name` wants whatever the platform calls this place, and guessing
    // which values are "really" names would drop the good ones.
    putStringOrNull(payload, "name", address.featureName)
    putStringOrNull(payload, "streetNumber", address.subThoroughfare)
    putStringOrNull(payload, "street", address.thoroughfare)
    putStringOrNull(payload, "district", address.subLocality)
    putStringOrNull(payload, "city", address.locality)
    putStringOrNull(payload, "subregion", address.subAdminArea)
    putStringOrNull(payload, "region", address.adminArea)
    putStringOrNull(payload, "postalCode", address.postalCode)
    putStringOrNull(payload, "country", address.countryName)
    putStringOrNull(payload, "isoCountryCode", address.countryCode)
    return payload
  }
}
