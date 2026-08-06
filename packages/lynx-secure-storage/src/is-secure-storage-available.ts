import { callNativeAsync, isNativeModuleAvailable } from '@amritk/mini-lynx-native'

import { MODULE } from './native-module'

/**
 * Answers whether this app can actually store a secret right now.
 *
 * Two questions, and both have to be `true`:
 *
 * 1. **Is the module linked?** A Lynx bundle can run inside a host app that
 *    autolinked this library and one that did not, and the difference is
 *    invisible until something calls it.
 * 2. **Does the platform's store answer?** The Keychain refuses a process with
 *    no keychain-access entitlement — the usual case is a bare simulator build
 *    — and an Android Keystore can be unusable on a device whose keys were
 *    invalidated. Both are real, and neither is visible from JavaScript.
 *
 * The second is a genuine probe rather than a guess: iOS runs a query for an
 * item it does not expect to find and reads the `OSStatus`, and Android opens
 * the encrypted preferences. Neither writes anything.
 *
 * This never throws. Every other function here does when the store cannot be
 * reached, so this is the branch you write when you would rather ask than
 * catch — a settings screen that hides "remember me", say.
 *
 * A `true` is about the store and not about a particular item: a
 * `whenUnlocked` item is still unreadable while the device is locked, and that
 * arrives as a thrown read or an `unavailable` write.
 *
 * @example
 * ```ts
 * if (!(await isSecureStorageAvailable())) return keepTokenInMemoryOnly()
 * ```
 */
export const isSecureStorageAvailable = async (): Promise<boolean> => {
  if (!(await isNativeModuleAvailable(MODULE))) return false
  try {
    return await callNativeAsync<boolean>(MODULE, 'isSecureStorageAvailable')
  } catch {
    // `callNativeAsync` rejects when the call could not be made at all — a host
    // that linked an older build of the native half without this method, for
    // instance. That is an unusable store by any reading, so it is a `false`
    // rather than an exception from the one function here that promises not to
    // throw.
    return false
  }
}
