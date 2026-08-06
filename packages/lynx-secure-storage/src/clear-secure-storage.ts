import { callNativeAsync } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'
import type { SecureVoidResult } from './types'
import { unwrapSecureResult } from './unwrap-secure-result'

/**
 * Deletes every item this package stores for this app.
 *
 * Scoped, on both platforms, and that scoping is the part worth knowing: iOS
 * deletes only `kSecClassGenericPassword` items whose `kSecAttrService` is this
 * app's — so a host app with Keychain items of its own keeps them — and Android
 * clears only this library's preferences file. Nothing here touches another
 * library's storage, and nothing here can be talked into it.
 *
 * ## It is already called for you once
 *
 * Keychain items **survive an app being uninstalled**, so a reinstall can find
 * a live session belonging to an install the user deliberately removed. The iOS
 * half handles that on its own: it keeps a first-run flag in `NSUserDefaults`,
 * which *is* cleared on uninstall, and clears the store when it finds the flag
 * missing. So a fresh install is a fresh store, and an app does not have to
 * remember to ask.
 *
 * You still want this for a sign-out that has to leave nothing behind.
 *
 * @example
 * ```ts
 * const signOutEverywhere = async (): Promise<void> => {
 *   await revokeOnServer()
 *   await clearSecureStorage()
 * }
 * ```
 */
export const clearSecureStorage = async (): Promise<void> => {
  unwrapSecureResult<undefined>(await callNativeAsync<SecureVoidResult>(MODULE, 'clearSecureStorage'), 'be cleared')
}
