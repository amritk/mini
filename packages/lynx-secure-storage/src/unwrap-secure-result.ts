import type { SecureWriteError } from './types'

/**
 * The shape every native method here answers with: a value, or a reason there
 * is none. `value` is optional so the methods that answer nothing at all —
 * `removeSecureItem`, `clearSecureStorage` — are read by the same helper.
 */
type SecureResult<T> =
  | { readonly ok: true; readonly value?: T }
  | { readonly ok: false; readonly error: SecureWriteError; readonly message: string }

/**
 * Reads a native result, and throws when it reports a failure.
 *
 * This is the one place in the package that turns a value into an exception,
 * and it is deliberate rather than a lapse from the house rule that failures
 * are values. `setSecureItem` returns its `SecureWriteResult` untouched,
 * because an app that has just been handed a credential has to branch on
 * whether it was persisted. The other four have no failure arm in their return
 * type at all — `getSecureItem` answers `string | null` — and that is the whole
 * point:
 *
 * **a read that failed must never arrive looking like a key that was absent.**
 *
 * `null` from a store that is working means the user is signed out. `null` from
 * a store that could not be opened means nothing of the kind, and an app that
 * cannot tell them apart signs a user out because a device was locked. So the
 * absent case is the return value and the broken case is a throw, which no call
 * site can read past by accident.
 *
 * Use `isSecureStorageAvailable()` when you want to ask instead of catching.
 *
 * The message names the key and never the value — see the "never log a value"
 * rule in `AGENTS.md`, which applies to anything that can reach a log, and an
 * exception message reaches every one of them.
 */
export const unwrapSecureResult = <T>(result: SecureResult<T>, action: string): T => {
  // The cast is what lets one helper serve both a read (`value` is the answer)
  // and a write (`value` is never written, and `T` is `undefined`). Narrowing
  // cannot express "optional here, required there" without two helpers that
  // would then be free to drift.
  if (result.ok) return result.value as T
  throw new Error(`secure storage could not ${action}: ${result.message} [${result.error}]`)
}
