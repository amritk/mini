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
 */
export const addEvent = (
  element: LynxElement,
  type: string,
  name: string,
  handler: (event: unknown) => void,
): Dispose => {
  const engine = requireEngine()
  const key = `${type}:${name}`

  const byElement = registrations.get(element) ?? new Map<string, Registration>()
  registrations.set(element, byElement)

  const existing = byElement.get(key)
  if (existing) {
    existing.handlers.add(handler)
  } else {
    const handlers = new Set([handler])
    const bound = eventTransport()((event) => {
      // Iterate a copy so a handler that detaches itself — or another — cannot
      // disturb the walk it is being called from.
      for (const listener of [...handlers]) guard('event', () => listener(event))
    })
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

/** What this module holds per element and `(type, name)` pair. */
type Registration = {
  readonly handlers: Set<(event: unknown) => void>
  /** What the engine is holding, so it can be released when the last handler goes. */
  readonly bound: BoundListener
}

/**
 * A `WeakMap` because the engine owns the elements: when a subtree is dropped
 * and the engine releases its nodes, these go with them without this module
 * needing to be told.
 */
const registrations = new WeakMap<LynxElement, Map<string, Registration>>()
