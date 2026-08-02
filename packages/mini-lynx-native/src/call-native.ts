import { sendCall } from './channel'

/**
 * Invokes a native method that **returns its result directly**, and resolves
 * with that result.
 *
 * Use this for the value-returning shape — `getValue(key): String` on Android,
 * `- (nullable NSString *)getValue:(NSString *)key` on iOS. For the other shape,
 * where the native method takes a trailing callback, use `callNativeAsync`.
 *
 * ## Why this returns a promise for a synchronous native method
 *
 * Because the method is synchronous *in the background context*, and you are
 * not in it. `NativeModules` is a background-thread global and a `mini-lynx`
 * tree renders on the main thread, so every call from a component crosses a
 * thread whatever the native side does. There is no version of this that hands
 * back a value in the same frame, and an API that pretended otherwise would be
 * lying about the only thing that matters here.
 *
 * The practical consequence is worth stating plainly: **a native value cannot
 * be read during a component's build**. Bind a signal, kick the call off, and
 * write the signal when it settles — which is the shape `@amritk/mini-lynx`
 * wants anyway.
 *
 * ## What crosses
 *
 * Arguments and results are serialised by the engine, so they must be plain
 * JSON: strings, numbers, booleans, null, arrays and plain objects. A function
 * argument is not carried — that is what `callNativeAsync` and `onNativeEvent`
 * are for.
 *
 * The type parameter is an assertion about what the native method returns, not
 * a check. Nothing validates it, here or on the wire.
 *
 * @example
 * ```ts
 * const stored = await callNative<string | null>('NativeLocalStorageModule', 'getValue', 'token')
 * ```
 */
export const callNative = <T = unknown>(module: string, method: string, ...args: readonly unknown[]): Promise<T> =>
  sendCall(module, method, args, 'return') as Promise<T>
