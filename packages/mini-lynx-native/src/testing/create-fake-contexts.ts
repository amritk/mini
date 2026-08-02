import type { ContextListener, ContextMessage, ContextProxy } from '../context-proxy'

/** A linked pair of contexts, plus the transcript of everything that crossed. */
export type FakeContexts = {
  /** The proxy the **main-thread** half talks through. Hand it to `setPeerContext`. */
  readonly mainThread: ContextProxy
  /** The proxy the **background** half serves on. Hand it to `installNativeBridge({ peer })`. */
  readonly background: ContextProxy
  /** Every message dispatched on either proxy, oldest first. */
  messages(): readonly ContextMessage[]
  /** Drops the transcript, leaving the wiring alone. */
  clear(): void
}

/**
 * Two context proxies wired to each other, so both halves of the bridge can be
 * driven in one process.
 *
 * This is the reference implementation of the contract in `context-proxy.ts`,
 * and it is what the whole suite runs against — the same position
 * `@amritk/mini-lynx`'s fake engine holds. The code under test is the code that
 * ships; only the two `lynx` accessors it would have called are replaced.
 *
 * ## Delivery is synchronous, and that is a choice
 *
 * On a device a message crosses a real thread and arrives later. Here it
 * arrives inside `dispatchEvent`. That is deliberate: a fake that also
 * introduced its own asynchrony would need a drain helper in every test, and
 * the timing it modelled would still not be the engine's. The asynchrony that
 * *matters* is preserved anyway, because the call API is promise-based — a
 * reply still settles on a microtask, so a test still has to `await` exactly
 * where real code does.
 *
 * What this cannot tell you is anything about ordering between the two contexts
 * under real concurrency. It can tell you the handshake works, which is the
 * part that has an ordering bug worth catching, and that one is testable
 * directly: install the background half after the main-thread half has already
 * queued calls, and assert they arrive.
 *
 * @example
 * ```ts
 * const contexts = createFakeContexts()
 * setPeerContext(contexts.mainThread)
 * const uninstall = installNativeBridge({ peer: contexts.background, modules })
 * ```
 */
export const createFakeContexts = (): FakeContexts => {
  const mainListeners = new Map<string, Set<ContextListener>>()
  const backgroundListeners = new Map<string, Set<ContextListener>>()
  const transcript: ContextMessage[] = []

  /**
   * The set is copied before the walk so a listener that unsubscribes during
   * delivery cannot mutate the collection being iterated — the same hazard the
   * real channel guards, reproduced here so a test can hit it.
   */
  const deliver = (to: Map<string, Set<ContextListener>>, message: ContextMessage): void => {
    const bound = to.get(message.type)
    if (!bound) return
    for (const listener of [...bound]) listener(message)
  }

  const proxy = (own: Map<string, Set<ContextListener>>, peer: Map<string, Set<ContextListener>>): ContextProxy => ({
    dispatchEvent: (event) => {
      transcript.push(event)
      deliver(peer, event)
      return undefined
    },
    addEventListener: (type, listener) => {
      const bound = own.get(type)
      if (bound) bound.add(listener)
      else own.set(type, new Set([listener]))
    },
    removeEventListener: (type, listener) => {
      own.get(type)?.delete(listener)
    },
  })

  return {
    mainThread: proxy(mainListeners, backgroundListeners),
    background: proxy(backgroundListeners, mainListeners),
    messages: () => transcript,
    clear: () => {
      transcript.length = 0
    },
  }
}
