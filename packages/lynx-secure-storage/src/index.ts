/**
 * `@amritk/lynx-secure-storage` — the platform's own encrypted key-value store,
 * for Lynx.
 *
 * Lynx ships no storage of any kind: `@lynx-js/types` declares no key-value API
 * on the `lynx` global at all. TikTok's `sparkling-storage` exists and is
 * neither secure nor complete — Android is plain `SharedPreferences`, which is
 * unencrypted XML that auto-backup sweeps up by default, and iOS ships no
 * implementation at all, only a `StorageService` protocol the host app is
 * expected to resolve from a DI registry. So there is nothing here to keep a
 * credential in, which is a problem the moment an app has one: a session token
 * in an engine that may have no cookie jar has to live somewhere, and
 * "somewhere" should not be a plain file.
 *
 * This is an Android module, an iOS module, and a promise-shaped facade that
 * reaches them.
 *
 * ## What you have to wire up
 *
 * One line, once.
 *
 * ```ts
 * // background chunk — the bridge that carries every call
 * import { installNativeBridge } from '@amritk/mini-lynx-native/background'
 *
 * installNativeBridge()
 * ```
 *
 * ```ts
 * // anywhere on the main thread — the app itself
 * import { getSecureItem, setSecureItem } from '@amritk/lynx-secure-storage'
 *
 * const written = await setSecureItem('session', token)
 * if (!written.ok) console.warn('not persisted', written.error)
 *
 * const session = await getSecureItem('session')   // null when there is none
 * ```
 *
 * The native side links itself: `lynx.lib.json` declares the Android and iOS
 * sources and Lynx's autolinking picks them up. There is **no permission and no
 * `Info.plist` key** — a keychain item and a Keystore key are not capabilities
 * either platform gates.
 *
 * ## Strings, not JSON
 *
 * The Keychain stores `Data` and `EncryptedSharedPreferences` stores a
 * `String`. Serialising is the caller's business, which keeps the contract
 * obvious and keeps this package out of the argument about what `undefined`
 * means.
 *
 * ## A failed read is not an empty one
 *
 * `setSecureItem` reports failure as a value. The other four throw, because
 * their return types have no failure arm and `null` from `getSecureItem` has to
 * keep meaning exactly one thing: **there is no such key**. A store that could
 * not be opened, reported as a store with nothing in it, signs a user out of an
 * app whose credential is intact on the disk — see `getSecureItem`.
 *
 * ## Not in 0.1: biometric-gated items
 *
 * No `LAContext`, no `setUserAuthenticationRequired`. Gating an item behind
 * Face ID means a prompt, a lifecycle around it, a cancellation path, and its
 * own set of failure modes on each platform — and half of that shipped would be
 * worse than none of it, because an app would wire a credential to a gate that
 * only works on one platform.
 *
 * ## Why there are no signals here
 *
 * The same reason `@amritk/lynx-dialogs` gives: a second edge onto the signal
 * engine is how a consumer ends up with two reactive graphs that cannot see
 * each other's writes. The surface is promises, and an app wires one into
 * whichever graph it already has in a line. It also means the package works
 * unchanged from ReactLynx, Vue Lynx, or plain background-thread code.
 */
export { clearSecureStorage } from './clear-secure-storage'
export { getSecureItem } from './get-secure-item'
export { hasSecureItem } from './has-secure-item'
export { isSecureStorageAvailable } from './is-secure-storage-available'
export { MAX_VALUE_BYTES, MODULE } from './native-module'
export { removeSecureItem } from './remove-secure-item'
export { setSecureItem } from './set-secure-item'
export type {
  SecureAccessibility,
  SecureItemOptions,
  SecureWriteError,
  SecureWriteResult,
} from './types'
