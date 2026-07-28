import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearEngine } from './engine/current-engine'
import { renderPage } from './entry'
import { globalProps, setGlobalProps } from './global-props'
import { onCleanup } from './on-cleanup'
import { setErrorHandler } from './report-error'
import { createFakeEngine } from './testing/create-fake-engine'
import { createElement } from './tree'

/**
 * The entry contract is small and entirely convention, which is exactly why it
 * is worth pinning: nothing about it fails loudly. A missing `renderPage` means
 * the engine never calls the app, and a missing `firstScreen` means the app
 * renders and the platform never considers it ready — a splash screen that does
 * not dismiss rather than anything that looks like an error.
 */

type LynxGlobals = {
  renderPage?: (data?: unknown) => void
  removeComponents?: () => void
  updateGlobalProps?: (props?: Readonly<Record<string, unknown>>) => void
  lynx?: { __globalProps?: Readonly<Record<string, unknown>> }
  __OnLifecycleEvent?: (event: { type: string }) => void
}

const globals = (): LynxGlobals => globalThis as unknown as LynxGlobals

afterEach(() => {
  clearEngine()
  setErrorHandler(null)
  setGlobalProps({})
  delete globals().renderPage
  delete globals().removeComponents
  delete globals().updateGlobalProps
  delete globals().lynx
  delete globals().__OnLifecycleEvent
})

describe('entry', () => {
  it('defines the global the engine calls, without rendering yet', () => {
    const engine = createFakeEngine()
    const component = vi.fn(() => createElementUnderEngine(engine))

    renderPage(component, { engine: engine.api })

    // Declaring is not rendering. The engine decides when the first screen
    // happens, and an app that built its tree at import time would have built it
    // before the engine was ready to be given one.
    expect(typeof globals().renderPage).toBe('function')
    expect(component).not.toHaveBeenCalled()
  })

  it('mounts into the page and reports the first screen', () => {
    const engine = createFakeEngine()
    const seen: string[] = []
    globals().__OnLifecycleEvent = (event) => seen.push(event.type)

    renderPage(() => createElementUnderEngine(engine), { engine: engine.api })
    globals().renderPage?.()

    expect(engine.page.children).toHaveLength(1)
    expect(engine.page.children[0]?.tag).toBe('view')
    // Missing this is the classic first mistake: the tree is up and the platform
    // is still waiting to be told.
    expect(seen).toEqual(['firstScreen'])
  })

  it('commits the first screen synchronously rather than waiting for the tick', async () => {
    const engine = createFakeEngine()

    renderPage(() => createElementUnderEngine(engine), { engine: engine.api })
    globals().renderPage?.()

    // Everything else in the runtime can afford to wait for the end of the
    // tick. The first paint cannot.
    expect(engine.flushes()).toBe(1)
  })

  it('tears the previous tree down when the engine reloads', () => {
    const engine = createFakeEngine()

    renderPage(() => createElementUnderEngine(engine), { engine: engine.api })
    globals().renderPage?.()
    expect(engine.page.children).toHaveLength(1)

    globals().removeComponents?.()

    // Without this the old tree's effects keep running against elements nothing
    // renders — a leak that only shows up after the second reload.
    expect(engine.page.children).toHaveLength(0)
  })

  it('survives an engine with no lifecycle hook installed', () => {
    const engine = createFakeEngine()
    renderPage(() => createElementUnderEngine(engine), { engine: engine.api })

    // An older engine build, or a test harness, may simply not have it. Failing
    // to boot over a missing optional hook would be a worse outcome than not
    // reporting the timing.
    expect(() => globals().renderPage?.()).not.toThrow()
  })

  it('still reports the first screen when the build throws', () => {
    const engine = createFakeEngine()
    const seen: string[] = []
    const reported: string[] = []
    globals().__OnLifecycleEvent = (event) => seen.push(event.type)
    setErrorHandler((_error, source) => reported.push(source))

    renderPage(
      () => {
        throw new Error('the root component threw')
      },
      { engine: engine.api },
    )

    // `firstScreen` is the platform's cue to stop waiting, not a report of
    // success. Skipping it leaves the app on its splash screen forever with
    // nothing anywhere saying why — strictly worse than a blank screen and a
    // crash report.
    expect(() => globals().renderPage?.()).not.toThrow()
    expect(seen).toEqual(['firstScreen'])
    expect(reported).toEqual(['render'])
  })

  it('reads the platform values that were already set before the page ran', () => {
    const engine = createFakeEngine()
    globals().lynx = { __globalProps: { theme: 'dark' } }

    renderPage(() => createElementUnderEngine(engine), { engine: engine.api })
    globals().renderPage?.()

    // Read before the build, so the first frame renders against the real values
    // rather than against defaults it then has to correct.
    expect(globalProps<{ theme?: string }>().theme).toBe('dark')
  })

  it('claims the slot the engine pushes later platform values through', () => {
    const engine = createFakeEngine()
    renderPage(() => createElementUnderEngine(engine), { engine: engine.api })
    globals().renderPage?.()

    globals().updateGlobalProps?.({ theme: 'light' })

    // The engine calls exactly one function for this, so exactly one thing in
    // the process may own it. A component that wanted to react to a theme
    // change would otherwise be hoping it was the one that got there.
    expect(globalProps<{ theme?: string }>().theme).toBe('light')
  })

  it('tears down once even when a cleanup throws', () => {
    const engine = createFakeEngine()
    const reported: string[] = []
    setErrorHandler((_error, source) => reported.push(source))

    renderPage(
      () => {
        onCleanup(() => {
          throw new Error('a cleanup threw')
        })
        return createElementUnderEngine(engine)
      },
      { engine: engine.api },
    )
    globals().renderPage?.()

    expect(() => globals().removeComponents?.()).not.toThrow()
    expect(reported).toEqual(['lifecycle'])

    // The engine is about to reuse this context either way, and a root that
    // stayed held after a failed teardown is what actually leaks.
    expect(() => globals().removeComponents?.()).not.toThrow()
    expect(reported).toEqual(['lifecycle'])
  })
})

/** Builds one element, with the engine installed by `renderPage` already current. */
const createElementUnderEngine = (_engine: ReturnType<typeof createFakeEngine>): ReturnType<typeof createElement> =>
  createElement('view')
