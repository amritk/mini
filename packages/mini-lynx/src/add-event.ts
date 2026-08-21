import { requireEngine } from './engine/current-engine'
import type { LynxElement, LynxElementApi } from './engine/element-api'
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
 * registration this module owns. The dispatcher is dropped again when the last
 * handler detaches, so the engine is not left calling into an empty pair on
 * every frame of a scroll.
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
 * ## One handler on one pair is the case worth not allocating for
 *
 * Fan-out is the case this module EXISTS for, but a single handler on a single
 * pair is the case it spends its time in: nearly every listener an app binds is
 * the only one on its pair, and nearly every element carries one pair. A
 * thousand-row list binds a couple of thousand of them in one frame, on the main
 * thread, so what this path allocates is what the frame pays for.
 *
 * Three things follow, and all three are about garbage rather than about work.
 *
 * The pairs on an element are held in an ARRAY, walked by `registrationOf`,
 * rather than in a `Map` keyed by `"type:name"`. A map of one costs a map to
 * allocate and a joined string to allocate and hash on every bind and every
 * detach, to answer a question a walk over one or two entries answers by
 * comparing the two strings the caller already holds — and those strings are
 * the shared, interned ones `apply-prop.ts` caches, so the comparison is
 * usually a pointer.
 *
 * The handler is stored DIRECTLY on the registration, and only promoted into a
 * `Set` when a second one actually joins the pair. A set of one is an
 * allocation and a hash to hold a single reference.
 *
 * And dispatch does not copy a set it does not have — see {@link dispatch}. The
 * dispatcher runs on every frame of a scroll, where the garbage it makes
 * competes with the layout it is scrolling.
 */
export const addEvent = (
  element: LynxElement,
  type: string,
  name: string,
  handler: (event: unknown) => void,
): Dispose => {
  const engine = requireEngine()

  const known = registrations.get(element)
  const pairs = known ?? []
  // Only on the way in. Re-setting a `WeakMap` entry that is already there is a
  // hash of the element for nothing, once per listener per element.
  if (known === undefined) registrations.set(element, pairs)

  const registration = registrationOf(pairs, type, name) ?? openPair(engine, element, pairs, type, name)

  const lone = registration.handler
  if (registration.handlers !== null) registration.handlers.add(handler)
  else if (lone === null) registration.handler = handler
  else if (lone !== handler) {
    // The pair has company for the first time, so it grows the set it has been
    // doing without. Re-binding the SAME handler is not company: a `Set` would
    // have deduplicated it, and so does falling through here.
    registration.handlers = new Set<Handler>().add(lone).add(handler)
    registration.handler = null
  }

  return () => detachHandler(engine, element, pairs, registration, handler)
}

/** One handler on one `(type, name)` pair. */
type Handler = (event: unknown) => void

/** The pair on `pairs` that matches, or `undefined` if this element has not bound it yet. */
const registrationOf = (pairs: readonly Registration[], type: string, name: string): Registration | undefined => {
  for (const pair of pairs) if (pair.type === type && pair.name === name) return pair
  return undefined
}

/**
 * Opens a fresh, handlerless pair: registers one dispatcher with the engine and
 * records what has to be released when the last handler eventually leaves.
 *
 * It starts empty rather than taking the first handler, so `addEvent` has a
 * single place that attaches one and a single dispose to return, whichever way
 * the pair was reached.
 */
const openPair = (
  engine: LynxElementApi,
  element: LynxElement,
  pairs: Registration[],
  type: string,
  name: string,
): Registration => {
  // The dispatcher reads the registration rather than closing over the handler
  // storage, because that storage CHANGES SHAPE the moment the pair gains a
  // second handler. Declared before it is built so the closure can name it; the
  // assignment is synchronous, and nothing can deliver an event in between.
  let registration!: Registration
  const bound = eventTransport()((event) => dispatch(registration, event))
  registration = { type, name, handler: null, handlers: null, bound }
  pairs.push(registration)
  engine.__AddEvent(element, type, name, bound.listener)
  return registration
}

/**
 * Removes one handler, and the whole pair with it when that handler was the
 * last one on it.
 *
 * The registration is matched by IDENTITY rather than looked up again by
 * `(type, name)`, which is what makes a stale detach harmless. A pair that
 * empties is spliced out of `pairs`, so a later call from the same dispose finds
 * nothing — and, more to the point, cannot reach into a FRESH registration that
 * a re-bind of the same pair put there in the meantime.
 */
const detachHandler = (
  engine: LynxElementApi,
  element: LynxElement,
  pairs: Registration[],
  registration: Registration,
  handler: Handler,
): void => {
  const at = pairs.indexOf(registration)
  if (at === -1) return

  const { handlers } = registration
  if (handlers !== null) {
    handlers.delete(handler)
    if (handlers.size > 0) return
  } else if (registration.handler === handler) {
    registration.handler = null
  } else {
    return
  }

  pairs.splice(at, 1)
  registration.bound.release()
  engine.__AddEvent(element, registration.type, registration.name, null)
}

/**
 * Runs every handler on a pair, guarded, for one delivered event.
 *
 * Several handlers are walked as a COPY, so one that binds or detaches another
 * mid-delivery cannot change the walk it is being called from — a handler added
 * during an event belongs to the next one, not to this one. A lone handler gets
 * that same guarantee for free by being read out first, which is worth a branch:
 * it is the shape almost every dispatch takes, and it turns a per-event array
 * allocation into none.
 */
const dispatch = (registration: Registration, event: unknown): void => {
  const { handlers } = registration
  if (handlers === null) {
    // Read out, THEN call. Reading through the registration inside the call
    // would cost nothing and be wrong: a lone handler that binds another would
    // have it run inside the very dispatch that bound it.
    const only = registration.handler
    if (only !== null) guard('event', () => only(event))
    return
  }
  if (handlers.size > 1) {
    for (const listener of [...handlers]) guard('event', () => listener(event))
    return
  }
  const [only] = handlers
  if (only !== undefined) guard('event', () => only(event))
}

/** What this module holds per `(type, name)` pair on an element. */
type Registration = {
  readonly type: string
  readonly name: string
  /**
   * The only handler on the pair, which is the overwhelmingly common shape.
   * `null` before the first one attaches, `null` once a second arrived and
   * {@link Registration.handlers} took over, and `null` again once the last one
   * left.
   */
  handler: Handler | null
  /** Allocated the first time the pair genuinely has more than one handler. */
  handlers: Set<Handler> | null
  /** What the engine is holding, so it can be released when the last handler goes. */
  readonly bound: BoundListener
}

/**
 * A `WeakMap` because the engine owns the elements: when a subtree is dropped
 * and the engine releases its nodes, these go with them without this module
 * needing to be told.
 */
const registrations = new WeakMap<LynxElement, Registration[]>()
