import type { NativeEventEmitter } from '../background/native-globals'

/** A stand-in for `GlobalEventEmitter`, with a handle on what native code would publish. */
export type FakeEmitter = NativeEventEmitter & {
  /** Publishes as `sendGlobalEvent` would, to every listener on `name`. */
  emit(name: string, ...args: readonly unknown[]): void
  /** How many listeners are attached to `name`. The bridge should never hold more than one. */
  listenerCount(name: string): number
}

/**
 * A fake `GlobalEventEmitter`, so the forwarding path can be driven without a
 * device.
 *
 * `listenerCount` is the interesting part rather than an afterthought: the
 * bridge promises to hold **one** emitter listener per event name however many
 * main-thread subscribers there are, and to let go of it when the last one
 * leaves. That promise is invisible in behaviour — a leak looks exactly like
 * working code until it has been running for a while — so the fake exposes the
 * count and the suite asserts on it.
 */
export const createFakeEmitter = (): FakeEmitter => {
  const listeners = new Map<string, Set<(...args: readonly unknown[]) => void>>()

  return {
    addListener: (name, listener) => {
      const bound = listeners.get(name)
      if (bound) bound.add(listener)
      else listeners.set(name, new Set([listener]))
    },
    removeListener: (name, listener) => {
      const bound = listeners.get(name)
      if (!bound?.delete(listener)) return
      if (bound.size === 0) listeners.delete(name)
    },
    emit: (name, ...args) => {
      const bound = listeners.get(name)
      if (!bound) return
      for (const listener of [...bound]) listener(...args)
    },
    listenerCount: (name) => listeners.get(name)?.size ?? 0,
  }
}
