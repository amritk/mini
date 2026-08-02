/**
 * The whole platform boundary of this package, as a type.
 *
 * Lynx gives each script context a proxy to the *other* one, and the proxy is
 * the only thing either side needs: `dispatchEvent` sends to the peer,
 * `addEventListener` receives from it. Which proxy names the peer depends on
 * which side you are:
 *
 * - the **main-thread** chunk reaches the background one through
 *   `lynx.getJSContext()`;
 * - the **background** chunk reaches the main-thread one through
 *   `lynx.getCoreContext()`.
 *
 * That asymmetry is the engine's, not this package's, and it is the single
 * fact `current-context.ts` exists to encode so nothing else has to remember
 * it.
 *
 * Declared here rather than imported from `@lynx-js/types` for the same reason
 * `@amritk/mini-lynx` declares `LynxElementApi`: the peer is what a test needs
 * to substitute, and a package whose only dependency is a types-only optional
 * peer cannot ask a consumer to install one to get a fake past the compiler.
 */
export type ContextProxy = {
  /** Sends a message to the peer context. */
  dispatchEvent(event: ContextMessage): unknown
  /** Subscribes to messages of one `type` arriving from the peer context. */
  addEventListener(type: string, listener: ContextListener): void
  /** Drops a subscription added by {@link ContextProxy.addEventListener}. */
  removeEventListener(type: string, listener: ContextListener): void
}

/**
 * A message on the wire between the two contexts.
 *
 * `type` is the channel and `data` is the payload — the same `{ type, data }`
 * shape the engine's own `MessageEvent` carries, narrowed to the two fields
 * that survive the crossing. Everything in `data` is serialised by the engine,
 * so it must be plain JSON: no functions, no class instances, no `undefined`
 * that has to round-trip as itself.
 */
export type ContextMessage = {
  readonly type: string
  readonly data?: unknown
}

/** What either side registers to hear from the other. */
export type ContextListener = (event: ContextMessage) => void
