package dev.amritk.minilynx.deeplinking

import com.lynx.react.bridge.JavaOnlyMap

/**
 * The `OpenResult` envelope, built on this side of the bridge.
 *
 * A failure travels as a value rather than as an exception because Lynx has no
 * error convention for bridge callbacks — `callNativeAsync` rejects only when
 * the call could not be *made*, so a native method that throws gives JavaScript
 * a rejected promise with nothing readable in it. Every failure path here
 * therefore ends in `failure(...)` and a normal callback invocation.
 */
internal object OpenResults {
  fun success(): JavaOnlyMap {
    val result = JavaOnlyMap()
    result.putBoolean("ok", true)
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
