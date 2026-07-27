import { globalEngine, setEngine } from './engine/current-engine'
import type { LynxElement, LynxElementApi } from './engine/element-api'
import { mount } from './mount'
import type { Dispose } from './types'

/**
 * The app entry point: installs the engine, renders the root when Lynx asks for
 * it, and tells the engine the first screen is up.
 *
 * ## What the engine expects
 *
 * A Lynx bundle carries two code slots — a main-thread chunk and a background
 * one — and the engine's entire contract with the main-thread chunk is that it
 * defines a global `renderPage(data)`, which the engine calls exactly once at
 * startup. Optionally it may also define `processData`, `updatePage`,
 * `updateGlobalProps`, `getPageData` and `removeComponents`.
 *
 * This runtime needs only the first of those, because it has no data pipeline
 * to sit in the middle of: state is signals, and a signal is written by whoever
 * owns it rather than pushed in from the platform. So the contract collapses to
 * "build the tree once", which is exactly what `mount` already does.
 *
 * ## Why `__OnLifecycleEvent({ type: 'firstScreen' })` matters
 *
 * The engine waits to be told that the first screen is complete. Miss it and
 * the app renders but the platform never considers it ready — which shows up as
 * a splash screen that never dismisses, or timing metrics that never fire,
 * rather than as anything that looks like a bug in the tree. `@lynx-js/react`
 * emits it after hydration; a runtime driving the PAPI directly has to emit it
 * itself, and forgetting to is the classic first mistake.
 *
 * @example
 * ```tsx
 * // main-thread.tsx — the entry the bundler marks as the main-thread chunk
 * import { renderPage } from '@amritk/mini-native'
 * import { App } from './app'
 *
 * renderPage(App)
 * ```
 */
export const renderPage = (component: () => LynxElement, options: RenderPageOptions = {}): void => {
  const engine = options.engine ?? globalEngine()
  const target = globalThis as unknown as LynxGlobals

  target.renderPage = () => {
    setEngine(engine)
    // The page element belongs to the engine and already exists by the time
    // `renderPage` is called; creating our own root here would build a tree
    // nothing is showing.
    const page = engine.__GetPageElement?.() ?? engine.__CreateElement('page', 0, {})
    disposeRoot = mount(page, component)
    target.__OnLifecycleEvent?.({ type: 'firstScreen' })
  }

  // A reload tears the tree down before the engine builds the next one. Without
  // this the old tree's effects keep running against elements nothing renders,
  // which is a leak that only shows up after the second reload.
  target.removeComponents = () => {
    disposeRoot?.()
    disposeRoot = undefined
  }
}

/** Held so a reload can tear the previous tree down. See `removeComponents` above. */
let disposeRoot: Dispose | undefined

export type RenderPageOptions = {
  /**
   * The engine to install. Defaults to the injected globals, which is what a
   * device build wants; pass a fake to drive an entry point from a test.
   */
  engine?: LynxElementApi
}

/** The slots the engine calls into, and the lifecycle hook it listens on. */
type LynxGlobals = {
  renderPage?: (data?: unknown) => void
  removeComponents?: () => void
  __OnLifecycleEvent?: (event: { type: string }) => void
}
