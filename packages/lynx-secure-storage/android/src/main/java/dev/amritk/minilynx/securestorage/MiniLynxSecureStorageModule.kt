package dev.amritk.minilynx.securestorage

import android.content.Context
import com.lynx.jsbridge.LynxContextModule
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxNativeModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap
import com.lynx.tasm.behavior.LynxContext
import java.util.concurrent.Executors

/**
 * The Android half of `@amritk/lynx-secure-storage`.
 *
 * Every method here is the other end of one function in the package's
 * TypeScript. The names, arities and call forms have to match exactly:
 * `src/testing/create-fake-secure-storage.ts` is the executable statement of
 * that contract, and it is what the JavaScript suite runs against.
 *
 * `@LynxNativeModule` registers the module through Lynx's annotation processor,
 * so an app that autolinks this library gets it without writing anything. An
 * app whose build does not run the processor can register it by hand instead:
 *
 * ```kotlin
 * LynxEnv.inst().registerModule("MiniLynxSecureStorageModule", MiniLynxSecureStorageModule::class.java)
 * ```
 *
 * ## Everything happens on one background thread
 *
 * Opening `EncryptedSharedPreferences` reads a file and talks to the Keystore,
 * and the first call of a process does key generation on top of that. A bridge
 * call already arrives off the UI thread, but it arrives on a thread Lynx needs
 * back — so the work moves to a single-thread executor of this package's own.
 *
 * Single-*threaded* rather than pooled, and that is the load-bearing half: two
 * concurrent recoveries would each delete the store the other had just
 * recreated, which is the one way to turn a store that recovers into a store
 * that never opens again.
 *
 * ## No permissions, no manifest entries a host has to write
 *
 * A Keystore key and an encrypted preferences file are not capabilities Android
 * gates, so nothing is requested. The library's manifest does contribute one
 * thing the host would otherwise have to remember — the backup exclusion for
 * its own preferences file — and `android/src/main/AndroidManifest.xml` says
 * why.
 */
@LynxNativeModule(name = "MiniLynxSecureStorageModule")
class MiniLynxSecureStorageModule(context: LynxContext) : LynxContextModule(context) {

  /**
   * The application context, taken once.
   *
   * A module is created per LynxView and a LynxContext belongs to one; the
   * store outlives every view in the process, so holding a view-scoped context
   * on the executor would keep a dead view tree alive for as long as the app
   * runs.
   */
  private val appContext: Context = context.applicationContext

  @LynxMethod
  fun getSecureItem(key: String?, callback: Callback) {
    answer(callback) {
      if (key == null) {
        StorageResults.failure(StorageResults.UNAVAILABLE, "a key is required")
      } else {
        SecureStore.withStore(appContext) { store ->
          StorageResults.value(store.getString(SecureStore.entryFor(key), null))
        }
      }
    }
  }

  /**
   * Writes one item, replacing whatever was under the key.
   *
   * `options` carries `accessibility`, which is a Keychain attribute with no
   * Android equivalent worth faking — a Keystore key is usable whenever this
   * process runs, and `setUnlockedDeviceRequired` is per-key and API 28+, so
   * honouring it here would mean a second master key, a second preferences file
   * and a read that has to look in both. `SecureAccessibility` says so on the
   * JavaScript side, which is where a caller reads it. The parameter stays in
   * the signature because the bridge arity is part of the contract, and because
   * the day this platform grows an equivalent it belongs here.
   */
  @LynxMethod
  fun setSecureItem(key: String?, value: String?, options: ReadableMap?, callback: Callback) {
    answer(callback) {
      when {
        key == null || value == null ->
          StorageResults.failure(StorageResults.UNAVAILABLE, "a key and a value are required")
        // Counted in UTF-8 bytes, which is what the iOS half counts and what
        // the value occupies once it is encrypted. Counting characters would
        // make the cap mean something different for a Japanese token.
        value.toByteArray(Charsets.UTF_8).size > SecureStore.MAX_VALUE_BYTES ->
          StorageResults.failure(
            StorageResults.TOO_LARGE,
            "a value may be at most ${SecureStore.MAX_VALUE_BYTES} bytes",
          )
        else ->
          SecureStore.withStore(appContext) { store ->
            // `commit` rather than `apply`: the caller is awaiting a promise
            // that says whether the credential was persisted, and `apply`
            // answers before the write has reached the disk. A process killed
            // in that window loses a write this method already reported as
            // done.
            val written = store.edit().putString(SecureStore.entryFor(key), value).commit()
            if (written) {
              StorageResults.success()
            } else {
              StorageResults.failure(StorageResults.KEYSTORE_FAILURE, "the encrypted store rejected the write")
            }
          }
      }
    }
  }

  @LynxMethod
  fun removeSecureItem(key: String?, callback: Callback) {
    answer(callback) {
      if (key == null) {
        StorageResults.failure(StorageResults.UNAVAILABLE, "a key is required")
      } else {
        SecureStore.withStore(appContext) { store ->
          // Removing a key that is not there is not an error on either
          // platform, and a sign-out path that failed for being run twice would
          // be a worse bug than the one it reported.
          store.edit().remove(SecureStore.entryFor(key)).commit()
          StorageResults.success()
        }
      }
    }
  }

  @LynxMethod
  fun hasSecureItem(key: String?, callback: Callback) {
    answer(callback) {
      if (key == null) {
        StorageResults.failure(StorageResults.UNAVAILABLE, "a key is required")
      } else {
        // `contains` still decrypts the key half of the entry — the keys are
        // encrypted too — but never the value, so nothing secret is decrypted
        // to answer a question about presence.
        SecureStore.withStore(appContext) { store ->
          StorageResults.presence(store.contains(SecureStore.entryFor(key)))
        }
      }
    }
  }

  @LynxMethod
  fun clearSecureStorage(callback: Callback) {
    answer(callback) {
      SecureStore.withStore(appContext) { store ->
        // Only this library's own file. A host app's other preferences, and any
        // other library's encrypted store, are untouched.
        store.edit().clear().commit()
        StorageResults.success()
      }
    }
  }

  /**
   * Whether this device can actually store a secret.
   *
   * A real open rather than a guess: the failure worth reporting is a Keystore
   * that will not produce a usable key, and nothing short of asking it for one
   * finds that out. The answer is a bare boolean because there is no second
   * thing to say about it — every other method reports *why* through its own
   * result.
   */
  @LynxMethod
  fun isSecureStorageAvailable(callback: Callback) {
    STORAGE.execute { callback.invoke(SecureStore.isUsable(appContext)) }
  }

  /**
   * Runs one operation off the bridge's thread and answers with whatever it
   * produced.
   *
   * The `catch` is the backstop rather than the plan — `SecureStore.withStore`
   * already turns every failure it knows about into a result — and it is here
   * because an exception escaping into the executor kills the thread this
   * package needs for every subsequent call, and leaves the caller's promise
   * unsettled with nothing to read.
   */
  private fun answer(callback: Callback, operation: () -> JavaOnlyMap) {
    STORAGE.execute {
      val result =
        try {
          operation()
        } catch (error: Exception) {
          StorageResults.failure(
            StorageResults.KEYSTORE_FAILURE,
            "the encrypted store could not be used (${error.javaClass.simpleName})",
          )
        }
      callback.invoke(result)
    }
  }

  companion object {
    /**
     * One thread for the whole process, for the reason the store is
     * `@Synchronized`: concurrent recoveries are how a recoverable store
     * becomes a permanently broken one. A module is created per LynxView, so
     * this cannot be per instance.
     */
    private val STORAGE = Executors.newSingleThreadExecutor()
  }
}
