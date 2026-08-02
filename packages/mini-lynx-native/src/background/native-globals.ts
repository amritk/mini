/**
 * The two background-thread globals this package serves, as types, plus the
 * lookups that find them.
 *
 * Both are declared here rather than imported from `@lynx-js/types` for the
 * reason `context-proxy.ts` gives: they are what a test substitutes, and a
 * package whose only dependency is a types-only optional peer cannot require a
 * consumer to install one before a fake will compile.
 */

/**
 * `NativeModules` — the registry the host app linked its modules into.
 *
 * A module is a bag of methods and a missing one is `undefined` rather than a
 * throw, which is exactly why `isNativeModuleAvailable` exists.
 */
export type NativeModuleRegistry = {
  readonly [module: string]: Readonly<Record<string, unknown>> | undefined
}

/**
 * `GlobalEventEmitter` — the channel native code publishes on through
 * `sendGlobalEvent`.
 *
 * Only the two methods the bridge uses are declared. The engine's emitter has
 * more, and none of them are this package's business.
 */
export type NativeEventEmitter = {
  addListener(name: string, listener: (...args: readonly unknown[]) => void): void
  removeListener(name: string, listener: (...args: readonly unknown[]) => void): void
}

/** What the background context is expected to have on it. */
type BackgroundGlobals = {
  NativeModules?: NativeModuleRegistry
  lynx?: { getJSModule?: (name: string) => unknown }
}

/** The injected `NativeModules`, or `undefined` outside a background context. */
export const globalNativeModules = (): NativeModuleRegistry | undefined =>
  (globalThis as BackgroundGlobals).NativeModules

/**
 * The engine's `GlobalEventEmitter`, or `undefined` where there is none.
 *
 * `getJSModule` is itself absent on the main thread, so this returning
 * `undefined` is the reliable signal that `installNativeBridge` was called in
 * the wrong chunk — which is the mistake most worth catching early, because
 * every other symptom of it is silence.
 */
export const globalEventEmitter = (): NativeEventEmitter | undefined => {
  const lynx = (globalThis as BackgroundGlobals).lynx
  return lynx?.getJSModule?.call(lynx, 'GlobalEventEmitter') as NativeEventEmitter | undefined
}
