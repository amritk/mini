package dev.amritk.minilynx.location

import android.location.Address
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap

/**
 * The `GeocodeResult` envelope, built on this side of the bridge.
 *
 * The sibling of [LocationResults], and it exists for the same reason: Lynx has
 * no error convention for bridge callbacks, so every failure travels as a value
 * and a native method that threw would give JavaScript a rejected promise with
 * nothing readable in it.
 */
internal object GeocodeResults {
  /**
   * A finished result for whatever the geocoder returned.
   *
   * An empty list becomes `notFound` rather than an empty success, because
   * `GeocodeResult` has exactly one spelling for "there is no address there" —
   * open water genuinely has none, and two spellings would mean a call site
   * could handle half of it and look correct.
   */
  fun of(addresses: List<Address>): JavaOnlyMap {
    if (addresses.isEmpty()) return failure(LocationEvents.NOT_FOUND, "no address at these coordinates")

    val payloads = JavaOnlyArray()
    for (address in addresses) payloads.pushMap(Geocoding.toPayload(address))

    val result = JavaOnlyMap()
    result.putBoolean("ok", true)
    result.putArray("addresses", payloads)
    return result
  }

  fun failure(code: String, message: String): JavaOnlyMap {
    val result = JavaOnlyMap()
    result.putBoolean("ok", false)
    result.putString("error", code)
    result.putString("message", message)
    return result
  }
}
