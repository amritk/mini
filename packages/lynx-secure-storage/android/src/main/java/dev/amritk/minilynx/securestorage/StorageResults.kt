package dev.amritk.minilynx.securestorage

import com.lynx.react.bridge.JavaOnlyMap

/**
 * The values that cross back to JavaScript, and the strings they are spelled
 * with.
 *
 * The error codes live here rather than beside the code that reports them for
 * the same argument `@amritk/lynx-dialogs` makes about its reason codes: these
 * are strings JavaScript switches on, and a typo in one is a branch that
 * silently never runs. One file holds every string that crosses, exactly as
 * `native-module.ts` and `types.ts` do on the other side, and
 * `src/native-contract.test.ts` reads this file to check both languages know
 * all three.
 *
 * **No message built here may contain a stored value.** Everything in this
 * store is a secret by construction, a message ends up in a log or an exception
 * sooner or later, and a log is a file. Failures are described by the exception
 * class that caused them and never by what was being read or written.
 */
internal object StorageResults {
  const val UNAVAILABLE = "unavailable"
  const val KEYSTORE_FAILURE = "keystoreFailure"
  const val TOO_LARGE = "tooLarge"

  /**
   * A read that found something, or a read that found nothing.
   *
   * `putNull` rather than omitting the key: JavaScript reads `value` as
   * `string | null`, and an absent key arrives as `undefined`, which is a
   * different thing to the one branch every caller writes.
   */
  fun value(stored: String?): JavaOnlyMap {
    val result = JavaOnlyMap()
    result.putBoolean("ok", true)
    if (stored == null) result.putNull("value") else result.putString("value", stored)
    return result
  }

  /** Whether a key is present, without decrypting what is under it. */
  fun presence(present: Boolean): JavaOnlyMap {
    val result = JavaOnlyMap()
    result.putBoolean("ok", true)
    result.putBoolean("value", present)
    return result
  }

  /** A write, a delete or a clear that happened. Carries no `value` on purpose. */
  fun success(): JavaOnlyMap {
    val result = JavaOnlyMap()
    result.putBoolean("ok", true)
    return result
  }

  /** Every failure, in the one shape `SecureWriteResult` describes. */
  fun failure(error: String, message: String): JavaOnlyMap {
    val result = JavaOnlyMap()
    result.putBoolean("ok", false)
    result.putString("error", error)
    result.putString("message", message)
    return result
  }
}
