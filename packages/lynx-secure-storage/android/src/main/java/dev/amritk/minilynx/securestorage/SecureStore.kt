package dev.amritk.minilynx.securestorage

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.lynx.react.bridge.JavaOnlyMap
import java.io.File
import java.security.KeyStore

/**
 * The encrypted preferences file, its master key, and the recovery that keeps a
 * broken one from ending the app.
 *
 * `EncryptedSharedPreferences` over a Keystore-backed `MasterKey`: AES256-SIV
 * for the keys (deterministic, so a key can still be looked up) and AES256-GCM
 * for the values. The master key lives in the AndroidKeyStore and never leaves
 * the device, which is the property the whole package rests on — and the reason
 * the library excludes its own file from backup, since a restored copy of these
 * bytes on another device is undecryptable ciphertext rather than data.
 *
 * ## Why the recovery is the important part
 *
 * `EncryptedSharedPreferences` **throws** when its keyset cannot be read, and
 * that happens for reasons that have nothing to do with this code: a restore
 * that brought the file back without the Keystore key, a device that drops
 * Keystore keys when the lock screen changes, an OEM that loses them on an OS
 * upgrade. The exception surfaces at `create`, which for most apps is on the
 * path to the first screen — so propagating it is a crash loop on launch, and
 * an app that will not open is worse than one that has to ask the user to sign
 * in again.
 *
 * So a store that cannot be opened is discarded and recreated: the preferences
 * file goes, the master key entry goes, and a new pair is built. The data is
 * unrecoverable in either case; the only question was whether the app survives
 * finding out.
 *
 * ## One thread
 *
 * Everything here is `@Synchronized` and the module runs it on a single-thread
 * executor. Two concurrent recoveries would each delete what the other had just
 * created, which is the one way to turn a recoverable store into a permanently
 * broken one.
 */
internal object SecureStore {
  /**
   * The preferences file, without the `.xml`.
   *
   * This exact name appears in `res/xml/minilynx_secure_storage_backup_rules.xml`
   * and in `res/xml/minilynx_secure_storage_data_extraction_rules.xml`, which
   * are what keep it out of cloud backup and device transfer.
   * `src/native-contract.test.ts` checks the three spellings still match,
   * because a rename here with the rules left behind is silent: the store keeps
   * working, and starts being backed up.
   */
  const val FILE = "minilynx_secure_storage"

  /**
   * Our own master key alias rather than `MasterKey.DEFAULT_MASTER_KEY_ALIAS`.
   *
   * The recovery below deletes the key entry, and the default alias is shared
   * by every library in the process that took the default — so deleting it
   * would destroy another library's store to fix ours.
   */
  private const val MASTER_KEY_ALIAS = "minilynx_secure_storage_master_key"

  /** The largest value this package stores, in UTF-8 bytes. Mirrors `MAX_VALUE_BYTES`. */
  const val MAX_VALUE_BYTES = 8192

  /**
   * Every caller's key is stored under this prefix, and the prefix exists for
   * one specific reason.
   *
   * `EncryptedSharedPreferences` keeps its own two keysets in this same file,
   * under `__androidx_security_crypto_encrypted_prefs_key_keyset__` and its
   * value-side twin, and it **throws** if anything tries to write those names.
   * A caller reaching one of them would land in the recovery path below and
   * take the whole store with it — the one way a caller could destroy their own
   * data through this API.
   *
   * Prefixing makes the collision unreachable instead of turning it into an
   * error a caller would have to know about, so every key that works on iOS
   * works here. It is invisible from JavaScript, and the keys are encrypted on
   * the way in regardless.
   */
  private const val KEY_PREFIX = "item:"

  private var cached: SharedPreferences? = null

  /** The name one caller-supplied key is filed under. */
  fun entryFor(key: String): String = KEY_PREFIX + key

  /**
   * Runs [operation] against the encrypted store, recovering once from a keyset
   * that cannot be read.
   *
   * The operation returns the result that goes back to JavaScript, so a failure
   * to open and a failure to decrypt come back in the same shape as a success —
   * there is no path from here that throws into Lynx's callback machinery.
   */
  @Synchronized
  fun withStore(context: Context, operation: (SharedPreferences) -> JavaOnlyMap): JavaOnlyMap {
    val store = cached ?: openOrRecover(context) ?: return unusable()
    cached = store

    return try {
      operation(store)
    } catch (error: Exception) {
      // A value that will not decrypt, rather than a keyset that will not open:
      // same cause, one level down, and the same answer. Everything is
      // discarded and the operation runs again against an empty store, so the
      // caller gets "there is nothing there" instead of an exception it has no
      // branch for.
      cached = null
      val rebuilt = openOrRecover(context, force = true) ?: return unusable(error)
      cached = rebuilt
      try {
        operation(rebuilt)
      } catch (fatal: Exception) {
        unusable(fatal)
      }
    }
  }

  /** Whether the store can be opened at all — the honest answer to `isSecureStorageAvailable`. */
  @Synchronized
  fun isUsable(context: Context): Boolean {
    val store = cached ?: openOrRecover(context)
    cached = store
    return store != null
  }

  /**
   * Opens the store, discarding and recreating it once if it will not open.
   *
   * Returns null when even the second attempt fails, which means the Keystore
   * itself is not usable — a device with a broken or unavailable keystore, and
   * nothing this package can repair.
   */
  private fun openOrRecover(context: Context, force: Boolean = false): SharedPreferences? {
    if (!force) {
      try {
        return create(context)
      } catch (error: Exception) {
        // Fall through to the discard. The exception is deliberately not
        // reported anywhere: its message is not something a user can act on,
        // and this package does not log.
      }
    }

    discard(context)
    return try {
      create(context)
    } catch (error: Exception) {
      null
    }
  }

  private fun create(context: Context): SharedPreferences {
    val masterKey =
      MasterKey.Builder(context, MASTER_KEY_ALIAS)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    return EncryptedSharedPreferences.create(
      context,
      FILE,
      masterKey,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
  }

  /**
   * Throws away the preferences file and the master key together.
   *
   * Both, and in that order: a file left behind with a new key is ciphertext
   * nothing can read, and a key left behind with a new file is a key the
   * platform may still consider invalidated. Every step is guarded because this
   * runs when things are already wrong, and a failure to delete must not stop
   * the attempt to recreate.
   */
  private fun discard(context: Context) {
    try {
      // Clearing first drops the in-memory copy the process may already hold,
      // which `deleteSharedPreferences` alone does not do for a file that was
      // opened before it was deleted.
      context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().clear().commit()
    } catch (error: Exception) {
      // An unopenable file cannot be cleared, which is the case this exists for.
    }

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        context.deleteSharedPreferences(FILE)
      } else {
        // `deleteSharedPreferences` arrived in API 24 and this library supports
        // 23, so the file goes by hand there. `.bak` is the write-ahead copy
        // the framework leaves behind, and a restore would find it.
        val prefsDir = File(context.applicationInfo.dataDir, "shared_prefs")
        File(prefsDir, "$FILE.xml").delete()
        File(prefsDir, "$FILE.xml.bak").delete()
      }
    } catch (error: Exception) {
      // Same reasoning: the recreate below is what matters.
    }

    try {
      val keyStore = KeyStore.getInstance("AndroidKeyStore")
      keyStore.load(null)
      keyStore.deleteEntry(MASTER_KEY_ALIAS)
    } catch (error: Exception) {
      // A keystore that cannot even be loaded is the unrecoverable case, and
      // the caller finds that out from the failed recreate rather than here.
    }
  }

  /**
   * The one failure this file reports, named by the exception class and never by
   * the key or the value involved.
   */
  private fun unusable(cause: Exception? = null): JavaOnlyMap =
    StorageResults.failure(
      StorageResults.KEYSTORE_FAILURE,
      if (cause == null) {
        "the encrypted store could not be opened"
      } else {
        "the encrypted store could not be opened (${cause.javaClass.simpleName})"
      },
    )
}
