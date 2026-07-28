import type { EventListenerValue } from '../engine/element-api'
import { registerWorklet, releaseWorklet } from './worklet-registry'

/**
 * How a listener reaches this runtime — the one engine assumption in the
 * package that a device could still disprove, made replaceable.
 *
 * ## Why this seam exists
 *
 * Everything else here is written against something the engine documents or the
 * types declare. Event delivery is not: `__AddEvent` takes a *worklet handle*,
 * the engine hands that token back to a global `runWorklet`, and the inference
 * this package rests on is that a token the FRAMEWORK made round-trips through
 * a mechanism ReactLynx's compiler usually supplies. That is read from the
 * engine's source rather than confirmed on hardware, and it is load-bearing for
 * every event in every app built on this runtime.
 *
 * Before this seam, a build where the inference turned out wrong meant editing
 * the package. Now it means installing a different transport at startup: the
 * listener form is the only thing that varies, so it is the only thing that has
 * to be swappable. `@amritk/mini-lynx/bridge` ships the fallback the design note
 * has always named — string handler names, with the app owning the receiving
 * end — so the recovery path is code with tests rather than a paragraph.
 *
 * A transport is called once per `(element, type, name)` that gains its first
 * handler, and its `release` runs when the last one detaches.
 */
export type EventTransport = (dispatch: (event: unknown) => void) => BoundListener

/** What a transport hands back: the value the engine stores, and how to forget it. */
export type BoundListener = {
  /** Passed straight to `__AddEvent`. A worklet handle, or a handler name. */
  readonly listener: EventListenerValue
  /** Drops whatever bookkeeping the transport did for this listener. */
  readonly release: () => void
}

/**
 * The default: a worklet handle resolved by this package's own `runWorklet`.
 *
 * This is the transport that keeps the runtime compilerless and its handlers on
 * the main thread, so a tap runs in the same frame as the gesture. Prefer it
 * unless a device tells you otherwise.
 */
export const workletTransport: EventTransport = (dispatch) => {
  const handle = registerWorklet(dispatch)
  return { listener: handle, release: () => releaseWorklet(handle) }
}

let current: EventTransport = workletTransport

/**
 * Installs the transport every subsequent listener is bound through.
 *
 * Call it once, before rendering. Listeners already bound keep the transport
 * they were bound with — rebinding them would mean walking the tree the engine
 * owns, and a mixed tree is not a state worth supporting when the only reason
 * to switch is that one of the two does not work at all.
 *
 * Pass `null` to go back to the default.
 *
 * @example
 * ```ts
 * // Only if the worklet round-trip fails on your engine build — see /bridge.
 * import { namedHandlerTransport } from '@amritk/mini-lynx/bridge'
 *
 * setEventTransport(namedHandlerTransport)
 * ```
 */
export const setEventTransport = (transport: EventTransport | null | undefined): void => {
  current = transport ?? workletTransport
}

/** The installed transport. Internal — `add-event.ts` is the only caller. */
export const eventTransport = (): EventTransport => current
