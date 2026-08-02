import type { ContextProxy } from './context-proxy'

/**
 * Which side of the bridge the caller is on, and therefore which of the
 * engine's two proxies names its peer.
 *
 * The names are the engine's: the background chunk is "the JS context" and the
 * main-thread chunk is "the core context", so each side asks for the *other*
 * one by name. Getting this backwards produces a channel that attaches without
 * error and never delivers anything, which is why the mapping lives in one
 * place and is spelled out rather than inferred.
 */
export type BridgeSide = 'main-thread' | 'background'

let override: ContextProxy | undefined

/**
 * Substitutes the peer context, for a test or for an app whose chunks are wired
 * unusually.
 *
 * There is no `lynx` global in a test runner, so without this the package could
 * only be exercised on a device. Pass `null` to go back to resolving the peer
 * off the engine.
 *
 * @example
 * ```ts
 * import { createFakeContexts } from '@amritk/mini-lynx-native/testing'
 *
 * const contexts = createFakeContexts()
 * setPeerContext(contexts.mainThread)
 * ```
 */
export const setPeerContext = (proxy: ContextProxy | null | undefined): void => {
  override = proxy ?? undefined
}

/**
 * The proxy addressing the other context, or `undefined` when there is none.
 *
 * Returns `undefined` rather than throwing because both halves have somewhere
 * better to put the failure: the main-thread channel warns once and lets calls
 * queue, and the background installer reports through its own error handler.
 * A throw here would surface inside whatever engine callback happened to be
 * running, which is the one place this package must never throw from.
 */
export const peerContext = (side: BridgeSide): ContextProxy | undefined => {
  if (override) return override
  const lynx = (globalThis as { lynx?: LynxContextGlobals }).lynx
  const resolve = side === 'main-thread' ? lynx?.getJSContext : lynx?.getCoreContext
  if (!resolve) return undefined
  return resolve.call(lynx) as ContextProxy | undefined
}

/**
 * The two accessors this package reads off the `lynx` object. Declared here
 * rather than imported so the package does not depend on a types-only peer
 * being installed.
 */
type LynxContextGlobals = {
  getJSContext?: () => unknown
  getCoreContext?: () => unknown
}
