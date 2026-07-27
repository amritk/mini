import { requireEngine } from './engine/current-engine'
import type { LynxElement } from './engine/element-api'
import { registerWorklet, releaseWorklet, type WorkletHandle } from './events/worklet-registry'
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
 * `events/worklet-registry.ts`, which is where the interesting part lives.
 *
 * The upshot for a caller is nothing at all: you pass a function, it runs, and
 * it runs on the main thread in the same frame as the gesture.
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
    const worklet = registerWorklet((event) => {
      // Iterate a copy so a handler that detaches itself — or another — cannot
      // disturb the walk it is being called from.
      for (const listener of [...handlers]) listener(event)
    })
    byElement.set(key, { handlers, worklet })
    engine.__AddEvent(element, type, name, worklet)
  }

  return () => {
    const registration = byElement.get(key)
    if (!registration) return
    registration.handlers.delete(handler)
    if (registration.handlers.size === 0) {
      byElement.delete(key)
      releaseWorklet(registration.worklet)
      engine.__AddEvent(element, type, name, null)
    }
  }
}

/** What this module holds per element and `(type, name)` pair. */
type Registration = {
  readonly handlers: Set<(event: unknown) => void>
  /** The token the engine is holding, so it can be released when the last handler goes. */
  readonly worklet: WorkletHandle
}

/**
 * A `WeakMap` because the engine owns the elements: when a subtree is dropped
 * and the engine releases its nodes, these go with them without this module
 * needing to be told.
 */
const registrations = new WeakMap<LynxElement, Map<string, Registration>>()
