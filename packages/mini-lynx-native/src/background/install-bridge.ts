import type { ContextMessage, ContextProxy } from '../context-proxy'
import { peerContext } from '../current-context'
import {
  CALL,
  type CallPayload,
  EVENT,
  HELLO,
  LISTEN,
  payloadOf,
  READY,
  REPLY,
  type ReplyPayload,
  type SubscribePayload,
  UNLISTEN,
} from '../protocol'
import { warn } from '../warn'
import {
  globalEventEmitter,
  globalNativeModules,
  type NativeEventEmitter,
  type NativeModuleRegistry,
} from './native-globals'

/** What an app can substitute when installing. All of it is for tests; a device wants none of it. */
export type InstallBridgeOptions = {
  /** The module registry to serve. Defaults to the background context's `NativeModules`. */
  readonly modules?: NativeModuleRegistry
  /** The emitter to forward from. Defaults to `lynx.getJSModule('GlobalEventEmitter')`. */
  readonly emitter?: NativeEventEmitter
  /** The context to serve on. Defaults to `lynx.getCoreContext()`. */
  readonly peer?: ContextProxy
}

/**
 * Installs the background half of the bridge: serves calls against
 * `NativeModules` and forwards `GlobalEventEmitter` events to the main thread.
 *
 * Call it **once, at startup, in the background chunk**. Returns the uninstall,
 * which drops every forwarded subscription and detaches from the context — a
 * test wants it, and so does anything that tears a Lynx view down without
 * ending the process.
 *
 * ```ts
 * // background chunk
 * import { installNativeBridge } from '@amritk/mini-lynx-native/background'
 *
 * installNativeBridge()
 * ```
 *
 * ## Why it announces itself
 *
 * The main-thread chunk usually runs first — the engine calls `renderPage` to
 * get a first screen up — so by the time this runs there may already be calls
 * queued on the other side. Installing therefore dispatches {@link READY}
 * immediately, and answers a {@link HELLO} with another one, so the handshake
 * completes no matter which chunk won the race.
 *
 * ## Nothing here may throw
 *
 * Every function in this file is entered from the engine's message delivery
 * rather than from an app's own call stack, so an exception leaving one unwinds
 * into native code with no defined behaviour. Failures are turned into a failed
 * {@link REPLY} where there is a call to fail, and warned about where there is
 * not. That is the same bargain `@amritk/mini-lynx` makes at its engine-facing
 * boundaries, for the same reason: there is nowhere useful to throw *to*, and a
 * silent swallow would be worse than either.
 */
export const installNativeBridge = (options: InstallBridgeOptions = {}): (() => void) => {
  const peer = options.peer ?? peerContext('background')
  if (!peer) {
    warn('cannot install: no peer context. Is this running in the background chunk?')
    return () => {}
  }

  const modules = options.modules ?? globalNativeModules()
  if (!modules) {
    warn('installing without a NativeModules registry; every call will fail as "not linked"')
  }

  const emitter = options.emitter ?? globalEventEmitter()
  /** One emitter listener per forwarded event name, so N subscribers cost one subscription. */
  const forwarding = new Map<string, (...args: readonly unknown[]) => void>()

  /** Sends without letting a dispatch failure escape into the engine's frame. */
  const send = (message: ContextMessage): void => {
    try {
      peer.dispatchEvent(message)
    } catch (error) {
      warn(`dispatching a message of type "${message.type}" threw:`, error)
    }
  }

  const reply = (payload: ReplyPayload): void => send({ type: REPLY, data: payload })

  /**
   * Resolves a method off the registry, or explains which half is missing.
   *
   * The distinction between "no such module" and "no such method on it" is
   * worth keeping: the first means the host app did not link the library, which
   * is a build problem, and the second means it linked an older version, which
   * is a version problem. They are fixed in different places.
   */
  const resolveMethod = (module: string, method: string): ((...args: unknown[]) => unknown) => {
    const target = modules?.[module]
    if (!target) throw new Error(`the native module "${module}" is not linked into this app`)
    const fn = target[method]
    if (typeof fn !== 'function') {
      throw new Error(`the native module "${module}" has no method "${method}"`)
    }
    return fn as (...args: unknown[]) => unknown
  }

  /** Answers an `exists` probe. Never throws: not-linked is the answer, not a failure. */
  const moduleExists = (module: string, method: string): boolean => {
    const target = modules?.[module]
    if (!target) return false
    return method === '' ? true : typeof target[method] === 'function'
  }

  const serveCall = (call: CallPayload): void => {
    const { id, module, method, args, form } = call

    if (form === 'exists') {
      reply({ id, ok: true, value: moduleExists(module, method) })
      return
    }

    try {
      const target = modules?.[module]
      const fn = resolveMethod(module, method)

      if (form === 'return') {
        reply({ id, ok: true, value: fn.apply(target, [...args]) })
        return
      }

      // The callback form. The promise behind this id settles on the FIRST
      // invocation and later ones are dropped — a native method that calls back
      // more than once wants `sendGlobalEvent` and `onNativeEvent` instead, and
      // saying so is more useful than a second reply the other side would warn
      // about. A method that never calls back leaves the caller's promise
      // pending forever, which is the one failure this wire cannot detect.
      let settled = false
      fn.apply(target, [
        ...args,
        (...results: readonly unknown[]) => {
          if (settled) {
            warn(`"${module}.${method}" invoked its callback more than once; ignoring the extra`)
            return
          }
          settled = true
          reply({ id, ok: true, value: results[0] })
        },
      ])
    } catch (error) {
      reply({ id, ok: false, error: describe(error) })
    }
  }

  const startForwarding = (name: string): void => {
    if (forwarding.has(name)) return
    if (!emitter) {
      warn(`cannot forward "${name}": no GlobalEventEmitter in this context`)
      return
    }
    const listener = (...args: readonly unknown[]): void => {
      send({ type: EVENT, data: { name, args } })
    }
    forwarding.set(name, listener)
    try {
      emitter.addListener(name, listener)
    } catch (error) {
      forwarding.delete(name)
      warn(`subscribing to the native event "${name}" threw:`, error)
    }
  }

  const stopForwarding = (name: string): void => {
    const listener = forwarding.get(name)
    if (!listener) return
    forwarding.delete(name)
    try {
      emitter?.removeListener(name, listener)
    } catch (error) {
      warn(`unsubscribing from the native event "${name}" threw:`, error)
    }
  }

  const onCall = (message: ContextMessage): void => {
    const call = payloadOf<CallPayload>(message)
    if (!call) return
    serveCall(call)
  }

  const onListen = (message: ContextMessage): void => {
    const payload = payloadOf<SubscribePayload>(message)
    if (payload) startForwarding(payload.name)
  }

  const onUnlisten = (message: ContextMessage): void => {
    const payload = payloadOf<SubscribePayload>(message)
    if (payload) stopForwarding(payload.name)
  }

  const onHello = (): void => send({ type: READY })

  peer.addEventListener(CALL, onCall)
  peer.addEventListener(LISTEN, onListen)
  peer.addEventListener(UNLISTEN, onUnlisten)
  peer.addEventListener(HELLO, onHello)
  send({ type: READY })

  return () => {
    peer.removeEventListener(CALL, onCall)
    peer.removeEventListener(LISTEN, onListen)
    peer.removeEventListener(UNLISTEN, onUnlisten)
    peer.removeEventListener(HELLO, onHello)
    for (const name of [...forwarding.keys()]) stopForwarding(name)
  }
}

/**
 * An arbitrary throw as a message worth reading on the other side.
 *
 * The value crosses as a string because an `Error` does not survive
 * serialisation — it arrives as `{}`. Anything that is not an `Error` is
 * stringified rather than dropped: native bridges throw strings and plain
 * objects often enough that discarding them would lose the only clue.
 */
const describe = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : `${String(error)}`
}
