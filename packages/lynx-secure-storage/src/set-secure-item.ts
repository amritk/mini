import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { SecureItemOptions, SecureWriteResult } from './types'

/**
 * Writes one item into the platform's encrypted store, replacing whatever was
 * under that key.
 *
 * ```ts
 * const written = await setSecureItem('session', token)
 * if (!written.ok) console.warn('not persisted', written.error)
 * ```
 *
 * ## The result is a value, and it is worth reading
 *
 * This is the one function here that reports failure as data rather than by
 * throwing, because it is the one whose failure changes what an app does next:
 * a credential that was not persisted means the user is signed in for this
 * launch only, and the app has to decide whether to say so. Every error code is
 * described on `SecureWriteError`.
 *
 * ## Strings only
 *
 * The Keychain stores `Data` and `EncryptedSharedPreferences` stores a
 * `String`, so this takes a string and serialising is yours:
 * `JSON.stringify(session)` going in, `JSON.parse` coming out. A store that
 * accepted objects would have to pick an encoding on your behalf and would then
 * be the thing that decides what `undefined` means.
 *
 * Values over `MAX_VALUE_BYTES` (8 KiB of UTF-8) answer `tooLarge` rather than
 * being truncated.
 *
 * ## Updating is one operation, not two
 *
 * The iOS half updates an existing item with `SecItemUpdate` instead of
 * deleting and adding, because between a delete and an add there is a window in
 * which the credential is simply gone — and a process killed inside that window
 * (which is exactly when the system kills apps: on a write, in the background)
 * leaves a user signed out with nothing to explain it.
 *
 * @example
 * ```ts
 * // Stronger than the default, and read the note on `SecureAccessibility`
 * // first: a `whenUnlocked` item cannot be read by background work while the
 * // screen is locked.
 * await setSecureItem('pin', pin, { accessibility: 'whenUnlocked' })
 * ```
 */
export const setSecureItem = (
  key: string,
  value: string,
  options: SecureItemOptions = {},
): Promise<SecureWriteResult> => callNativeAsync<SecureWriteResult>(MODULE, 'setSecureItem', key, value, options)
