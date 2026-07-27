import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearEngine } from './engine/current-engine'
import { renderPage } from './entry'
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
  __OnLifecycleEvent?: (event: { type: string }) => void
}

const globals = (): LynxGlobals => globalThis as unknown as LynxGlobals

afterEach(() => {
  clearEngine()
  delete globals().renderPage
  delete globals().removeComponents
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
})

/** Builds one element, with the engine installed by `renderPage` already current. */
const createElementUnderEngine = (_engine: ReturnType<typeof createFakeEngine>): ReturnType<typeof createElement> =>
  createElement('view')
