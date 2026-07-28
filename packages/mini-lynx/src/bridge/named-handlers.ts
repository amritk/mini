import type { EventTransport } from '../events/transport'
import { guard } from '../report-error'
import { warn } from '../warn'

/**
 * The fallback event transport: string handler names, with the app owning the
 * wire that carries the event back.
 *
 * ## When you need this
 *
 * Only when the default does not work on your engine build. The worklet
 * transport binds a token this package made and relies on the engine handing it
 * back to `runWorklet` untouched — an inference read from the engine's source
 * rather than confirmed on hardware. If a device says otherwise, the symptom is
 * unmistakable and total: the tree renders correctly and nothing responds to
 * touch, with one line in the native log.
 *
 * That is the failure this module exists for, and swapping is one line:
 *
 * ```ts
 * import { setEventTransport } from '@amritk/mini-lynx'
 * import { dispatchNamedEvent, namedHandlerTransport } from '@amritk/mini-lynx/bridge'
 *
 * setEventTransport(namedHandlerTransport)
 * ```
 *
 * ## Why the app has to supply the other half
 *
 * A string listener is a handler NAME, and the engine routes it to the
 * **background** thread: it calls `lynxCoreInject.tt.publishEvent(name, event)`
 * in the background context. This runtime lives on the main thread, so the
 * handler the engine is trying to reach is in the other context and the event
 * has to be carried back.
 *
 * The carrying is the app's, and deliberately so — it is the one part of this
 * that depends on your Lynx version and on how your bundle is split, and a
 * runtime that hard-coded a guess would fail the same silent way it is trying
 * to rescue you from. What this module owns is the part that is the same
 * everywhere: naming the handlers, keeping the table, and resolving a name back
 * to the closure that was bound.
 *
 * A typical wiring, with the background chunk forwarding to the main one:
 *
 * ```ts
 * // background chunk — the engine calls this by name
 * lynxCoreInject.tt.publishEvent = (name, event) =>
 *   lynx.getCoreContext().dispatchEvent({ type: 'mini-lynx:event', data: { name, event } })
 *
 * // main-thread chunk — hand it to the table
 * lynx.getJSContext().addEventListener('mini-lynx:event', ({ data }) =>
 *   dispatchNamedEvent(data.name, data.event),
 * )
 * ```
 *
 * ## What it costs
 *
 * A thread hop per event, and with it the property this package's design note
 * calls the main-thread gift: a handler no longer runs in the same frame as the
 * gesture that triggered it. Every synchronous guarantee downstream of that —
 * a signal write reaching the tree before the frame commits — goes with it.
 * That is why this is the fallback and not the default.
 */

/**
 * The prefix on every handler name this module hands out.
 *
 * Exported so a forwarder can tell this runtime's events from another
 * framework's on the same page, which is the situation a migration lives in for
 * as long as it takes.
 */
export const HANDLER_PREFIX = 'mini-lynx:'

/** Bound dispatchers, keyed by the handler name the engine is holding. */
const dispatchers = new Map<string, (event: unknown) => void>()

let nextId = 1

/**
 * Binds a listener as a handler NAME rather than as a worklet handle.
 *
 * Install it with `setEventTransport(namedHandlerTransport)`. Names are unique
 * per binding rather than per element or per event type, so two handlers on the
 * same element cannot collide, and `release` forgets one the moment its last
 * handler detaches — the table holds nothing an element does not.
 */
export const namedHandlerTransport: EventTransport = (dispatch) => {
  const name = `${HANDLER_PREFIX}${nextId++}`
  dispatchers.set(name, dispatch)
  return { listener: name, release: () => dispatchers.delete(name) }
}

/**
 * Delivers an event the engine published to the listener bound under `name`.
 *
 * Returns whether a listener was found, so a page running more than one
 * framework can fall through to the other one instead of dropping the event.
 * An unknown name warns rather than throwing: by the time this is called the
 * event has already crossed a thread, and the element it was bound to may have
 * been removed in between — a stale name is an ordinary race, not a mistake.
 *
 * The listener is guarded exactly as the worklet path guards its own, because
 * the frame above this one is usually the engine's message delivery and a throw
 * there is somebody else's undefined behaviour.
 */
export const dispatchNamedEvent = (name: string, event: unknown): boolean => {
  const dispatch = dispatchers.get(name)
  if (!dispatch) {
    warn('bridge: no listener is bound under the handler name:', name)
    return false
  }
  guard('event', () => dispatch(event))
  return true
}

/** Drops every binding. For tests, which need a clean table per case. */
export const clearNamedHandlers = (): void => {
  dispatchers.clear()
  nextId = 1
}
