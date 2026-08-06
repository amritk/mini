import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { SecureVoidResult } from './types'
import { unwrapSecureResult } from './unwrap-secure-result'

/**
 * Deletes one item, if it is there.
 *
 * Removing a key that does not exist is not an error on either platform and is
 * not one here — `errSecItemNotFound` from `SecItemDelete` is the ordinary
 * answer for a signed-out app signing out again, and a sign-out path that threw
 * for being run twice would be a worse bug than the one it reported.
 *
 * It throws only when the deletion could not be *attempted*: no module, no
 * Keychain, a Keystore that will not open. That is the same rule
 * `getSecureItem` follows, and for the same reason — this one is usually called
 * on the way out, and an app that has decided to sign a user out needs to know
 * whether the credential is actually gone.
 *
 * @example
 * ```ts
 * const signOut = async (): Promise<void> => {
 *   await removeSecureItem('session')
 *   router.navigate('/sign-in')
 * }
 * ```
 */
export const removeSecureItem = async (key: string): Promise<void> => {
  unwrapSecureResult<undefined>(
    await callNativeAsync<SecureVoidResult>(MODULE, 'removeSecureItem', key),
    `remove "${key}"`,
  )
}
