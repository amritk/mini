import { guard } from '../report-error'
import type { LynxElementApi } from './element-api'

/**
 * The engine this runtime drives, and the one commit it schedules per tick.
 *
 * A module-level engine rather than a renderer instance threaded through the
 * tree is a deliberate trade. TypeScript resolves the JSX factory from a module
 * (`jsxImportSource`), so `jsx` has to be a module-level export — it cannot be
 * a method on an object without a compiler plugin to rewrite call sites, and
 * staying compilerless is the point. One engine per context is also all any
 * real app needs: you are rendering to a screen, and there is one of those.
 */
let current: LynxElementApi | null = null

/** Pending commit, coalescing every mutation in a tick into a single flush. */
let flushQueued = false

/**
 * Installs the engine. Call this once, before rendering anything.
 *
 * On a device this is `setEngine(globalEngine())` — the PAPI is injected as
 * globals, so there is nothing to import and nothing to configure. In a test it
 * is a fake from `@amritk/mini-lynx/testing`, which is the whole reason the
 * engine is passed in rather than reached for.
 *
 * @example
 * ```ts
 * import { globalEngine, mount, setEngine } from '@amritk/mini-lynx'
 *
 * setEngine(globalEngine())
 * mount(pageElement(), App)
 * ```
 */
export const setEngine = (engine: LynxElementApi): void => {
  current = engine
  onEngineChanged?.()
}

/**
 * Called whenever the installed engine changes, so anything cached FROM the
 * engine can be dropped.
 *
 * A callback registered by `tree.ts` rather than a direct import, because the
 * dependency runs the other way — `tree` is written against this module — and
 * an import cycle between the two would be a real one rather than a
 * type-only one.
 */
let onEngineChanged: (() => void) | undefined

export const onEngineChange = (listener: () => void): void => {
  onEngineChanged = listener
}

/**
 * Returns the installed engine, or throws if there is not one yet.
 *
 * A missing engine is a boot-order mistake rather than a recoverable
 * condition — the app cannot render anything at all without one — so this
 * throws. Every caller is deep inside rendering, where there is no sensible way
 * to carry a failure back out.
 */
export const requireEngine = (): LynxElementApi => {
  if (!current) {
    throw new Error('No engine installed. Call setEngine(...) before rendering.')
  }
  return current
}

/**
 * Clears the installed engine. This exists for tests, which need each case to
 * start from a clean context rather than inheriting the previous one's tree.
 */
export const clearEngine = (): void => {
  current = null
  onEngineChanged?.()
}

/**
 * Asks the engine to commit at the end of the current tick.
 *
 * Nothing appears on screen until the tree is flushed, and flushing is not
 * free, so the runtime coalesces: however many attributes a tick wrote, the
 * engine is asked to commit exactly once.
 *
 * The tick is scheduled on the promise job queue rather than with
 * `queueMicrotask`, which is a host global every platform happens to provide
 * but no JavaScript engine is required to — and Lynx's main-thread context is
 * exactly the sort of restricted environment where that distinction stops being
 * theoretical. `Promise.resolve().then` is the same microtask, spelled in
 * ECMAScript.
 *
 * The engine is read when the flush RUNS rather than when it is scheduled.
 * Closing over it would strand a swap: install one engine, render (which queues
 * a commit against it), install another in the same tick, and the outgoing
 * engine would receive the commit while the incoming one — the only engine with
 * anything on screen — never got flushed. For the same reason `clearEngine`
 * leaves the queued flag alone: the pending microtask is what clears it.
 *
 * The commit is guarded because of where it runs. A throw here escapes into the
 * promise job queue and becomes an unhandled rejection — and Lynx's main-thread
 * context is exactly the sort of restricted environment where nothing is
 * listening for one, so the commit that stopped happening would be the only
 * symptom. Worse, the flag is cleared before the call rather than after, so a
 * failed commit does not wedge the scheduler: the next mutation queues a fresh
 * one and the screen can recover.
 */
export const scheduleFlush = (): void => {
  if (flushQueued || !current) return
  flushQueued = true
  void Promise.resolve().then(() => {
    flushQueued = false
    guard('commit', () => current?.__FlushElementTree())
  })
}

/**
 * Reads the PAPI off the global object — how an app gets the real engine.
 *
 * The functions are injected as bare globals rather than exported from a
 * module, so there is nothing to import; collecting them into one object here
 * is what lets everything downstream treat the engine as an ordinary
 * dependency. Bound to `globalThis` so a method's receiver survives the
 * collection.
 */
export const globalEngine = (): LynxElementApi => globalThis as unknown as LynxElementApi
