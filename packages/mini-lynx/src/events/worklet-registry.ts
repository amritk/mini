import { type ErrorSource, guard } from '../report-error'

/**
 * The handle→closure table behind every event listener, and the global the
 * engine calls to reach it.
 *
 * ## Why a table exists at all
 *
 * You cannot hand Lynx a closure. `__AddEvent` accepts three forms and a raw
 * function is not usefully one of them:
 *
 * | listener | what the engine does |
 * | --- | --- |
 * | `string` | routes the event to the BACKGROUND thread by handler name |
 * | `{ type: 'worklet', value }` | calls a global `runWorklet(value, …)` on the MAIN thread |
 * | a function | stored, and then never invoked on the modern fiber architecture |
 *
 * The third row is the trap. The published documentation types the parameter as
 * `string | Function`, and the engine's own declaration types it as
 * `string | Object | undefined`. A closure is accepted at bind time, stored, and
 * silently dropped at dispatch: fiber-arch dispatch reads the handler's worklet
 * OBJECT and a closure leaves that field empty, so the tap produces a log line
 * in native and nothing else. It is precisely the kind of failure that survives
 * every test that is not run on a device.
 *
 * ## What this module does instead
 *
 * The second row, with one observation that removes the compiler everybody else
 * needs: **the engine never interprets `value`.** It hands the token straight
 * back to a global function named `runWorklet` — and `runWorklet` is supplied by
 * the FRAMEWORK, not by the engine. ReactLynx puts a compiler-produced handle
 * there and resolves it against a registry its `'main thread'` transform
 * populates; Vue Lynx does the same thing with its own transform.
 *
 * Nothing requires the token to come from a compiler. An integer is a perfectly
 * good token if the thing resolving it is ours, so this module hands out
 * integers and installs the `runWorklet` that resolves them. That is the whole
 * mechanism, and it is what lets this runtime stay compilerless while still
 * handling events on the main thread, synchronously, with no thread hop.
 *
 * ## The honest caveat
 *
 * The engine-side mechanism is read from the engine's own source: dispatch
 * fetches the global `runWorklet` by name and calls it with the token, the event
 * array, and an options object. That a FRAMEWORK-DEFINED token round-trips
 * through it unmodified follows from the engine never looking inside `value` —
 * but it has not been verified end-to-end on a device by this package. If a
 * particular engine build turns out to disagree, nothing here has to change:
 * this module is one implementation of `events/transport.ts`, and installing a
 * different transport is what an app does instead. `/bridge` ships the one the
 * design note has always named.
 */

/** A token the engine stores and hands back. Opaque to the engine, an index to us. */
export type WorkletHandle = {
  readonly type: 'worklet'
  readonly value: { readonly id: number }
}

/** A dispatcher and the boundary name a throw out of it should be reported under. */
type Entry = {
  readonly dispatch: (event: unknown) => void
  readonly source: ErrorSource
}

/** The dispatchers, keyed by the token id the engine holds. */
const dispatchers = new Map<number, Entry>()

let nextId = 1
let installed = false

/**
 * Registers a dispatcher and returns the handle to give the engine.
 *
 * Installing the global lazily — on the first listener rather than at import —
 * keeps the module free of import-time side effects, which matters because the
 * bundle's main-thread chunk is evaluated in a context this package does not
 * control and should not be writing to before it is asked to.
 */
export const registerWorklet = (dispatch: (event: unknown) => void, source: ErrorSource = 'event'): WorkletHandle => {
  install()
  const id = nextId++
  dispatchers.set(id, { dispatch, source })
  return { type: 'worklet', value: { id } }
}

/** Forgets a dispatcher. The engine keeps no reference once the listener is removed. */
export const releaseWorklet = (handle: WorkletHandle): void => {
  dispatchers.delete(handle.value.id)
}

/**
 * Installs the global the engine calls at dispatch time.
 *
 * The signature is the engine's: it calls `runWorklet(value, args, options)`
 * where `args` is an array whose first entry is the event. An unknown token is
 * ignored rather than throwing — a stale handle can legitimately arrive for an
 * element that was removed in the same tick as the gesture that hit it, and
 * throwing out of a native dispatch is a worse outcome than dropping an event
 * for a node that no longer exists.
 *
 * A throw from the dispatcher is contained for the same reason, one step
 * further out: this function is called BY the engine, so an exception leaving it
 * unwinds into native event delivery, where the outcome is undefined and ranges
 * from the frame's remaining listeners being skipped to the app going down. It
 * is reported instead — see `report-error.ts` for why that is the honest trade
 * rather than a swallow.
 */
const install = (): void => {
  if (installed) return
  installed = true

  const target = globalThis as unknown as { runWorklet?: (value: unknown, args?: unknown[]) => unknown }
  const previous = target.runWorklet

  target.runWorklet = (value: unknown, args?: unknown[]): unknown => {
    const id = (value as { id?: number } | null)?.id
    const entry = typeof id === 'number' ? dispatchers.get(id) : undefined
    if (entry) {
      guard(entry.source, () => entry.dispatch(args?.[0]))
      return undefined
    }
    // Anything this table does not own is passed on, so a page that also runs
    // another framework — a migration, an embedded card — keeps working. Ours
    // is not the only runtime that may want this global. It is guarded too: the
    // other framework's throw would unwind through the same native frame.
    let result: unknown
    guard('event', () => {
      result = previous?.(value, args)
    })
    return result
  }
}

/** Drops the registry and the global. For tests, which need a clean context per case. */
export const clearWorklets = (): void => {
  dispatchers.clear()
  installed = false
  nextId = 1
  delete (globalThis as { runWorklet?: unknown }).runWorklet
}
