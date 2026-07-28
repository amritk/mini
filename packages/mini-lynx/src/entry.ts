import { globalEngine, setEngine } from './engine/current-engine'
import type { LynxElement, LynxElementApi } from './engine/element-api'
import { setGlobalProps } from './global-props'
import { mount } from './mount'
import { guard } from './report-error'
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
 * This runtime needs two of those, and ignores the rest because it has no data
 * pipeline to sit in the middle of: state is signals, and a signal is written by
 * whoever owns it rather than pushed in from the platform. So the contract
 * collapses to "build the tree once", which is exactly what `mount` already
 * does, plus the two slots the engine uses to reach the page *later*:
 * `removeComponents` before a reload, and `updateGlobalProps` when the platform
 * pushes new values. Both are claimed here rather than left to the app because
 * the engine calls exactly one function for each — see `global-props.ts` for
 * why that makes them the runtime's to own.
 *
 * ## Why the first screen is announced even when the build fails
 *
 * `firstScreen` is not a report of success; it is the platform's cue to stop
 * waiting. Skipping it after a throw leaves the app on its splash screen
 * forever with no error anywhere — the worst of both outcomes, since a failed
 * build that still hands over gives you a blank screen you can see, a report you
 * can read, and a process you can navigate out of. So the build is guarded, the
 * failure is reported through `setErrorHandler`, and the handover happens
 * either way.
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
 * import { renderPage } from '@amritk/mini-lynx'
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
    // Whatever the platform already decided before the page ran — colour scheme,
    // locale, flags. Read before the build so the first frame renders against
    // the real values rather than against defaults it then has to correct.
    guard('lifecycle', () => {
      // Through `unknown` because `@lynx-js/types` declares `__globalProps` as
      // an augmentable interface with no index signature — an app's own shape,
      // which is exactly what makes it unassignable to a bag of unknowns here.
      const initial = (globalThis as unknown as LynxRuntimeGlobal).lynx?.__globalProps
      if (initial) setGlobalProps(initial)
    })

    guard('render', () => {
      // The page element belongs to the engine and already exists by the time
      // `renderPage` is called; creating our own root here would build a tree
      // nothing is showing.
      const page = engine.__GetPageElement?.() ?? engine.__CreateElement('page', 0, {})
      disposeRoot = mount(page, component)
    })

    // Outside the build's guard on purpose: the platform is told the page is up
    // whether or not the build got there. See the note above. It has a guard of
    // its own because this whole function is running inside the engine's call.
    guard('lifecycle', () => target.__OnLifecycleEvent?.({ type: 'firstScreen' }))
  }

  // A reload tears the tree down before the engine builds the next one. Without
  // this the old tree's effects keep running against elements nothing renders,
  // which is a leak that only shows up after the second reload. A throw in a
  // cleanup must not stop the teardown: the engine is about to reuse this
  // context either way, and a half-disposed tree is what leaks.
  target.removeComponents = () => {
    const previous = disposeRoot
    disposeRoot = undefined
    guard('lifecycle', () => previous?.())
  }

  // The platform pushing new values — a theme toggle, a language change, a flag
  // flipping. The engine calls one function for this, so the runtime claims it
  // and turns it into a signal instead.
  target.updateGlobalProps = (next) => {
    guard('lifecycle', () => setGlobalProps(next ?? {}))
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

/**
 * The one thing this file reads off the `lynx` object: the platform values that
 * were already set before the page ran. Declared here rather than imported so
 * the entry point does not depend on a types-only peer being installed.
 */
type LynxRuntimeGlobal = {
  lynx?: { __globalProps?: Readonly<Record<string, unknown>> }
}

/** The slots the engine calls into, and the lifecycle hook it listens on. */
type LynxGlobals = {
  renderPage?: (data?: unknown) => void
  removeComponents?: () => void
  updateGlobalProps?: (props?: Readonly<Record<string, unknown>>) => void
  __OnLifecycleEvent?: (event: { type: string }) => void
}
