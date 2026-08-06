import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { SecureBooleanResult } from './types'
import { unwrapSecureResult } from './unwrap-secure-result'

/**
 * Answers whether a key is present, without bringing its value across the
 * bridge.
 *
 * That is the whole reason this exists rather than `(await getSecureItem(k)) !==
 * null`: a splash screen deciding which route to show does not need the token,
 * and a credential that never leaves the native side is a credential that was
 * never in a JavaScript string, a bridge message, or a heap dump.
 *
 * On iOS the query asks for the item's attributes and not `kSecReturnData`, so
 * the value is not decrypted at all. On Android the encrypted preferences have
 * to be opened either way, so the saving there is only the trip across the
 * bridge.
 *
 * Throws when the store could not be read, exactly as `getSecureItem` does —
 * `false` means "not there", never "could not tell".
 *
 * @example
 * ```ts
 * const start = (await hasSecureItem('session')) ? '/home' : '/sign-in'
 * ```
 */
export const hasSecureItem = async (key: string): Promise<boolean> =>
  unwrapSecureResult<boolean>(
    await callNativeAsync<SecureBooleanResult>(MODULE, 'hasSecureItem', key),
    `check "${key}"`,
  )
