/**
 * `@amritk/mini-lynx-native` — the main-thread side of Lynx's native modules.
 *
 * ## The problem in one paragraph
 *
 * `NativeModules` and `GlobalEventEmitter` are background-thread globals; Lynx
 * says so outright ("native modules can only be used in Background Thread
 * Scripting"). `@amritk/mini-lynx` renders on the main thread, because the
 * Element PAPI it drives is a main-thread API. So the runtime that draws your
 * UI and the context that can reach the platform are two different JavaScript
 * worlds, and a component reaching for `NativeModules` finds `undefined` — not
 * an error, not a warning, just a property that is not there.
 *
 * This package is the wire between them. The main-thread half is this entry;
 * the background half is `@amritk/mini-lynx-native/background` and **an app has
 * to install it**, in one line, in its background chunk. Everything here queues
 * until it does.
 *
 * ```ts
 * // background chunk — once, at startup
 * import { installNativeBridge } from '@amritk/mini-lynx-native/background'
 *
 * installNativeBridge()
 * ```
 *
 * ```tsx
 * // main-thread chunk — anywhere in a component
 * import { callNative, onNativeEvent } from '@amritk/mini-lynx-native'
 *
 * const battery = signal(0)
 * callNative<number>('BatteryModule', 'level').then(battery)
 * ```
 *
 * ## Why the app installs the other half rather than this package doing it
 *
 * Because the background chunk is the app's, and which module runs there is a
 * bundler question this package cannot answer — the same reasoning
 * `@amritk/mini-lynx/bridge` gives for making the app own the receiving end of
 * its event wire. A package that tried to inject itself into a context it
 * cannot see would work for one bundler configuration and fail silently for
 * every other one.
 *
 * ## What this costs
 *
 * A thread hop per call, and with it every synchronous guarantee. A native
 * value cannot be read during a component's build; it arrives later and writes
 * a signal. That is not a limitation this package invented — it is what having
 * the platform on another thread means — but it is the thing to design around
 * rather than discover.
 */
export { callNative } from './call-native'
export { callNativeAsync } from './call-native-async'
export { type NativeEventListener, resetNativeChannel } from './channel'
export type { ContextListener, ContextMessage, ContextProxy } from './context-proxy'
export { type BridgeSide, setPeerContext } from './current-context'
export { isNativeModuleAvailable } from './is-native-module-available'
export { onNativeEvent } from './on-native-event'
