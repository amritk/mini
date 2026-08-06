import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { SecureStringResult } from './types'
import { unwrapSecureResult } from './unwrap-secure-result'

/**
 * Reads one item out of the platform's encrypted store, or `null` when there is
 * no such key.
 *
 * The Keychain (`kSecClassGenericPassword`) on iOS;
 * `EncryptedSharedPreferences` over a Keystore-backed master key on Android.
 *
 * ```ts
 * const token = await getSecureItem('session')
 * ```
 *
 * ## `null` means absent, and only absent
 *
 * A read that could not be *performed* — the device is locked and the item is
 * `whenUnlocked`, the Keystore rejected the key, the module is not linked —
 * **throws** rather than answering `null`. That asymmetry is the most important
 * thing on this page. The value in this store is usually the thing that decides
 * whether the user is signed in, and an unreadable store reported as an empty
 * one signs them out of an app whose credential is sitting on the disk intact.
 *
 * So handle the two separately:
 *
 * ```ts
 * try {
 *   const token = await getSecureItem('session')
 *   if (token === null) showSignIn()        // genuinely not there
 *   else resume(token)
 * } catch {
 *   showRetry()                             // unknown, and not the same thing
 * }
 * ```
 *
 * `isSecureStorageAvailable()` answers the same question ahead of time when a
 * branch reads better than a `catch`.
 *
 * ## After a recovery, absent is the truth
 *
 * Android discards an encrypted store whose keyset it can no longer read — the
 * usual cause is a restored backup or a device that dropped its Keystore keys
 * — and recreates it empty, because the alternative is a crash loop on launch.
 * The item really is gone at that point, so `null` is the honest answer and the
 * user does have to sign in again. See the README for why the library excludes
 * itself from backup rather than letting that happen.
 */
export const getSecureItem = async (key: string): Promise<string | null> =>
  unwrapSecureResult<string | null>(
    await callNativeAsync<SecureStringResult>(MODULE, 'getSecureItem', key),
    `read "${key}"`,
  )
