package dev.amritk.minilynx.location

import android.location.Location
import com.lynx.react.bridge.JavaOnlyMap

/**
 * The `LocationResult` envelope, built on this side of the bridge.
 *
 * A failure travels as a value rather than as an exception because Lynx has no
 * error convention for bridge callbacks — `callNativeAsync` rejects only when
 * the call could not be *made*, so a native method that throws gives JavaScript
 * a rejected promise with nothing readable in it. Every failure path here
 * therefore ends in `failure(...)` and a normal callback invocation.
 */
internal object LocationResults {
  fun success(location: Location): JavaOnlyMap {
    val result = JavaOnlyMap()
    result.putBoolean("ok", true)
    result.putMap("position", LocationFixes.toPayload(location))
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
