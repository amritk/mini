import { requireEngine } from './engine/current-engine'
import type { LynxElement } from './engine/element-api'
import { type BoundListener, eventTransport } from './events/transport'
import { guard } from './report-error'
import type { Dispose } from './types'

/**
 * Registers an event listener, working around two engine constraints at once.
 *
 * ## One: the engine keeps a single listener per (type, name)
 *
 * Registering a second overwrites the first, **silently**. That is not a corner
 * case — `ref` exists so an app can attach its own listener to an element a
 * component already wired, and a gesture recogniser attaches several. So one
 * dispatcher is registered per pair and the real handlers are fanned out from a
 * set this module owns. The dispatcher is dropped again when the last handler
 * detaches, so the engine is not left calling into an empty set on every frame
 * of a scroll.
 *
 * ## Two: the listener cannot be a closure
 *
 * It has to be a worklet handle — an opaque token the engine hands back to a
 * global `runWorklet` that this runtime supplies. A raw function is accepted at
 * bind time and then never invoked on the modern engine, which is the worst
 * possible failure mode and exactly the one this indirection avoids. See
 * `events/worklet-registry.ts`, which is where the interesting part lives, and
 * `events/transport.ts` for why the choice of listener form is installable
 * rather than written into this file.
 *
 * The upshot for a caller is nothing at all: you pass a function, it runs, and
 * it runs on the main thread in the same frame as the gesture.
 *
 * ## Handlers are isolated from each other
 *
 * The fan-out is the reason. Several handlers on one pair is the normal case —
 * a component binds `bindtap` and a `ref` binds another — and they did not
 * choose to share a dispatcher, so one throwing must not cost the others their
 * event. Each runs guarded, and a throw is reported rather than propagated;
 * `setErrorHandler` is where those reports go.
 *
 * ## One handler is the case worth not allocating for
 *
 * Fan-out is the case this module EXISTS for, but a single handler is the case
 * it spends its time in: nearly every listener an app binds is the only one on
 * its pair. Two things follow, and both are about garbage rather than about
 * work. The set is built EMPTY and added to, because `new Set([handler])` walks
 * an iterable this call site had to allocate to hand over. And dispatch does not
 * copy a set of one — see {@link dispatch}. The second matters more than it
 * looks: the dispatcher runs on every frame of a scroll, on the main thread,
 * where the garbage it makes competes with the layout it is scrolling.
 */
export const addEvent = (
  element: LynxElement,
  type: string,
  name: string,
  handler: (event: unknown) => void,
): Dispose => {
  const engine = requireEngine()
  const key = `${type}:${name}`

  const known = registrations.get(element)
  const byElement = known ?? new Map<string, Registration>()
  // Only on the way in. Re-setting a `WeakMap` entry that is already there is a
  // hash of the element for nothing, once per listener per element.
  if (known === undefined) registrations.set(element, byElement)

  const existing = byElement.get(key)
  if (existing) {
    existing.handlers.add(handler)
  } else {
    const handlers = new Set<Handler>().add(handler)
    const bound = eventTransport()((event) => dispatch(handlers, event))
    byElement.set(key, { handlers, bound })
    engine.__AddEvent(element, type, name, bound.listener)
  }

  return () => {
    const registration = byElement.get(key)
    if (!registration) return
    registration.handlers.delete(handler)
    if (registration.handlers.size === 0) {
      byElement.delete(key)
      registration.bound.release()
      engine.__AddEvent(element, type, name, null)
    }
  }
}

/** One handler on one `(type, name)` pair. */
type Handler = (event: unknown) => void

/**
 * Runs every handler on a pair, guarded, for one delivered event.
 *
 * Several handlers are walked as a COPY, so one that binds or detaches another
 * mid-delivery cannot change the walk it is being called from — a handler added
 * during an event belongs to the next one, not to this one. A set of one gets
 * that same guarantee for free by reading its handler out first, which is worth
 * a branch: it is the shape almost every dispatch takes, and it turns a
 * per-event array allocation into none.
 */
const dispatch = (handlers: Set<Handler>, event: unknown): void => {
  if (handlers.size > 1) {
    for (const listener of [...handlers]) guard('event', () => listener(event))
    return
  }
  // Read out, THEN call. Iterating the live set instead would cost nothing and
  // be wrong: a `Set` iterator visits entries added while it is running, so a
  // lone handler that binds another would have it run inside the very dispatch
  // that bound it.
  const [only] = handlers
  if (only !== undefined) guard('event', () => only(event))
}

/** What this module holds per element and `(type, name)` pair. */
type Registration = {
  readonly handlers: Set<Handler>
  /** What the engine is holding, so it can be released when the last handler goes. */
  readonly bound: BoundListener
}

/**
 * A `WeakMap` because the engine owns the elements: when a subtree is dropped
 * and the engine releases its nodes, these go with them without this module
 * needing to be told.
 */
const registrations = new WeakMap<LynxElement, Map<string, Registration>>()
