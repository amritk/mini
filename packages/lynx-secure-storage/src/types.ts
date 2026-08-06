/**
 * The shapes that cross between JavaScript and the native module, in one file
 * so the Kotlin and the Objective-C have a single thing to agree with.
 *
 * Everything here is serialised by the engine on its way across, so every type
 * is plain JSON. **Values are strings and nothing else** — the Keychain stores
 * `Data` and `EncryptedSharedPreferences` stores a `String`, so serialising an
 * object is the caller's business and the contract stays a shape you can read
 * off the type.
 */

/**
 * When the item is readable on iOS.
 *
 * Both map to a `ThisDeviceOnly` Keychain constant, which is the load-bearing
 * half: without that suffix an item rides out of the device through iCloud
 * Keychain and encrypted backups, and a credential that syncs is a credential
 * on a machine nobody audited.
 *
 * - `afterFirstUnlock` — readable once the user has unlocked the device *once*
 *   since boot, and from then on even while it is locked. The default, because
 *   a token has to be readable by whatever the app does in the background.
 * - `whenUnlocked` — readable only while the device is unlocked. Stronger, and
 *   it means a background read after the screen locks fails with
 *   `unavailable` rather than answering.
 *
 * **iOS only.** Android's Keystore-backed key is usable whenever the app's
 * process runs, and there is no per-item equivalent worth faking:
 * `setUnlockedDeviceRequired` is per-*key* and API 28+, so honouring this on
 * Android would mean a second master key, a second preferences file and a read
 * that has to look in both. The option is recorded on Android and applied
 * nowhere, exactly as `minuteInterval` is in `@amritk/lynx-dialogs`.
 */
export type SecureAccessibility = 'whenUnlocked' | 'afterFirstUnlock'

/** How one item is written. Everything here is per item, not per store. */
export type SecureItemOptions = {
  /**
   * Defaults to `afterFirstUnlock` — readable by background work after a
   * reboot. See `SecureAccessibility` for why that is the default and why this
   * is iOS only.
   */
  readonly accessibility?: SecureAccessibility
}

/**
 * Why a write did not happen.
 *
 * - `unavailable` — the store could not be reached *right now*: the native
 *   module is not linked into this host app, the Keychain refused the process
 *   (a simulator without the entitlement), or the item needed an unlocked
 *   device and the device is locked. Environmental, and usually transient.
 * - `keystoreFailure` — the store is there and the cryptography failed: a
 *   Keystore key that the platform invalidated, a keyset that could not be
 *   recovered, or an `OSStatus` no branch here expected. **Not** transient.
 * - `tooLarge` — the value is over `MAX_VALUE_BYTES` once encoded as UTF-8.
 *   Both platforms will happily store more; the cap is this package's, so that
 *   a value which fits on one platform fits on the other, and because anything
 *   near it is a document rather than a credential.
 */
export type SecureWriteError = 'unavailable' | 'keystoreFailure' | 'tooLarge'

/**
 * The outcome of a write.
 *
 * A discriminated union rather than a rejection, for the reason every result in
 * this repository's native packages is one: Lynx has no error convention for
 * bridge callbacks, so a failure travels as a value anyway — and an app holding
 * a freshly issued credential has to *know* whether it was persisted before it
 * decides the user is signed in.
 *
 * @example
 * ```ts
 * const written = await setSecureItem('session', token)
 * if (!written.ok) signOutAndAskAgain(written.error)
 * ```
 */
export type SecureWriteResult =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly error: SecureWriteError
      /** A native-side description. For logs, and it never contains the value. */
      readonly message: string
    }

/**
 * What a read answers on the wire.
 *
 * `value` is `null` for a key that is not there, which is an ordinary answer —
 * and the reason this is a union rather than a bare `string | null`: a read
 * that *failed* must never arrive looking like a key that was absent. The
 * facade turns the failure arm into a thrown error precisely so those two
 * cannot be confused at a call site, because confusing them signs a user out
 * of an app whose credential is sitting right there.
 *
 * Not exported from the package: it is the wire, not the surface.
 */
export type SecureStringResult =
  | { readonly ok: true; readonly value: string | null }
  | { readonly ok: false; readonly error: SecureWriteError; readonly message: string }

/** What `hasSecureItem` answers on the wire. Same argument as `SecureStringResult`. */
export type SecureBooleanResult =
  | { readonly ok: true; readonly value: boolean }
  | { readonly ok: false; readonly error: SecureWriteError; readonly message: string }

/**
 * What a native method that answers nothing reports.
 *
 * The optional `value` is there so one unwrapping helper can read every result
 * shape in this file; the native halves never write it.
 */
export type SecureVoidResult =
  | { readonly ok: true; readonly value?: undefined }
  | { readonly ok: false; readonly error: SecureWriteError; readonly message: string }
