import { sendCall } from './channel'

/**
 * Invokes a native method that **takes a trailing callback**, and resolves with
 * the first argument that callback is handed.
 *
 * This is the shape Lynx documents for anything that cannot answer immediately:
 * `Callback` on Android, a `void (^)(id)` block on iOS. The background half
 * appends the callback itself — you pass only the real arguments — and settles
 * the promise when the native side invokes it.
 *
 * ## The one-shot assumption, and where it does not hold
 *
 * A promise settles once, so only the *first* invocation of the callback is
 * carried; a native method that calls its callback repeatedly will have every
 * invocation after the first dropped, silently, because there is no longer a
 * promise to settle. That is the right trade for a request/response method and
 * the wrong one for a stream — for streams, have the native side publish
 * through `GlobalEventEmitter` and subscribe with `onNativeEvent`.
 *
 * ## Failure
 *
 * Lynx has no error convention for callbacks — a native method reports failure
 * however its author chose, usually as a field on the object it hands back. So
 * this rejects only when the call could not be *made*: the module is not
 * linked, the method is not on it, or the native side threw. A call that
 * reached the module and came back with `{ ok: false }` is a resolved promise
 * carrying that object, and reading it is the caller's job.
 *
 * @example
 * ```ts
 * const value = await callNativeAsync<string>('NativeLocalStorageModule', 'getValueAsync', 'token')
 * ```
 */
export const callNativeAsync = <T = unknown>(module: string, method: string, ...args: readonly unknown[]): Promise<T> =>
  sendCall(module, method, args, 'callback') as Promise<T>
