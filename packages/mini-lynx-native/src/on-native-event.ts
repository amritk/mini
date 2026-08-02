import { type NativeEventListener, subscribe } from './channel'

/**
 * Subscribes to an event the native side publishes, and returns the
 * unsubscribe.
 *
 * ## What is on the other end
 *
 * Lynx's native-to-JavaScript push is `GlobalEventEmitter`, which native code
 * reaches through `sendGlobalEvent` (Android `LynxView.sendGlobalEvent`, iOS
 * `-[LynxView sendGlobalEvent:params:]`). Like `NativeModules`, the emitter
 * exists only in the background context — `lynx.getJSModule` is not callable on
 * the main thread — so the same hop this package makes for calls is the one it
 * makes for events, in the other direction.
 *
 * The background half attaches one emitter listener per event *name*, no matter
 * how many main-thread subscribers there are, and drops it when the last one
 * leaves.
 *
 * ## Why the arguments are `unknown`
 *
 * Because the emitter's are. `sendGlobalEvent` carries whatever the native
 * caller passed, and nothing between there and here inspects it. Narrow it at
 * the edge of your own code — a module package like
 * `@amritk/lynx-notifications` is the right place to do that once, so
 * screens get a typed payload instead of a cast each.
 *
 * ## Unsubscribing is not optional
 *
 * The returned function drops the listener *and*, when it was the last one on
 * that name, tells the background half to detach from the emitter. A screen
 * that subscribes on build and never unsubscribes keeps a listener alive across
 * every navigation, which on a long-lived page is a leak that grows with use.
 * Register it with `onCleanup` and the runtime handles it.
 *
 * @example
 * ```ts
 * import { onCleanup } from '@amritk/mini-lynx'
 *
 * onCleanup(onNativeEvent('deeplink', (url) => route(String(url))))
 * ```
 */
export const onNativeEvent = (name: string, listener: NativeEventListener): (() => void) => subscribe(name, listener)
