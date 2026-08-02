package dev.amritk.minilynx.dialogs

import com.lynx.react.bridge.JavaOnlyMap

/**
 * The values that cross back to JavaScript, and the strings they are spelled
 * with.
 *
 * The reason codes live here rather than beside the code that reports them for
 * the same argument `@amritk/lynx-location` makes about its error codes: these
 * are strings JavaScript switches on, and a typo in one is a branch that
 * silently never runs. One file holds every string that crosses, exactly as
 * `native-module.ts` and `types.ts` do on the other side, and
 * `src/native-contract.test.ts` reads this file to check that both languages
 * know all three.
 */
internal object DialogResults {
  const val DISMISSED = "dismissed"
  const val BUSY = "busy"
  const val UNAVAILABLE = "unavailable"

  /**
   * A chosen instant, in milliseconds since the epoch.
   *
   * `putDouble` rather than `putInt` because an epoch millisecond does not fit
   * in 32 bits — a date in 2026 is about 1.8e12 — and an `Int` here would
   * silently wrap into a timestamp in 1970. Doubles carry integers exactly up
   * to 2^53, so nothing is lost on the way across.
   */
  fun date(millis: Long): JavaOnlyMap {
    val result = JavaOnlyMap()
    result.putBoolean("ok", true)
    result.putDouble("value", millis.toDouble())
    return result
  }

  /** The row the user chose, as a position in the array JavaScript passed. */
  fun action(index: Int): JavaOnlyMap {
    val result = JavaOnlyMap()
    result.putBoolean("ok", true)
    result.putInt("index", index)
    return result
  }

  /** Cancellation and every failure, which share a shape on purpose — see `DialogDismissReason`. */
  fun failure(reason: String, message: String): JavaOnlyMap {
    val result = JavaOnlyMap()
    result.putBoolean("ok", false)
    result.putString("reason", reason)
    result.putString("message", message)
    return result
  }
}
