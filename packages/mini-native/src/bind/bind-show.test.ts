import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from '../engine/current-engine'
import { effectScope, signal } from '../signals'
import { applyStyle } from '../style/apply-style'
import { createFakeEngine, type FakeEngine } from '../testing/create-fake-engine'
import { createElement, insert } from '../tree'
import { bindShow } from './bind-show'

afterEach(() => {
  clearEngine()
})

/** The inline declarations the engine currently holds for the mounted view. */
const stylesOf = (engine: FakeEngine): Record<string, string> => engine.find('view')?.styles ?? {}

describe('bind-show', () => {
  it('hides the element during setup when the getter says so', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const view = createElement('view')
    insert(engine.pageElement, view, null)

    bindShow(view, () => false)

    expect(stylesOf(engine)['display']).toBe('none')
  })

  it('follows the signal as it toggles', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const visible = signal(true)
    const view = createElement('view')
    insert(engine.pageElement, view, null)

    bindShow(view, visible)
    // Showing leaves NO display declaration behind, because an element whose
    // own style said nothing about it should lay out however it would have on
    // its own — and Lynx's default is configurable per page.
    expect('display' in stylesOf(engine)).toBe(false)

    visible(false)
    expect(stylesOf(engine)['display']).toBe('none')

    visible(true)
    expect('display' in stylesOf(engine)).toBe(false)
  })

  it('leaves the element in the tree while it is hidden', () => {
    // This is the whole difference between the `show` prop and the `Show`
    // component: hiding keeps the subtree alive, so anything inside it — a
    // half-typed input, a scroll position — survives being hidden and shown.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const visible = signal(true)
    const view = createElement('view')
    insert(engine.pageElement, view, null)

    bindShow(view, visible)
    visible(false)

    expect(engine.page.children).toHaveLength(1)
  })

  it('survives a style write on the same element', () => {
    // Visibility and the style bag share one channel on Lynx, and a wholesale
    // style write used to quietly un-hide a hidden element — order-dependent on
    // how the props happened to be written, so it failed intermittently.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const view = createElement('view')
    insert(engine.pageElement, view, null)

    bindShow(view, () => false)
    applyStyle(view, { width: 20 })

    expect(stylesOf(engine)).toEqual({ width: '20px', display: 'none' })
  })

  it('restores the display its own style asked for', () => {
    // The other half of sharing a channel: showing must put back what the bag
    // wanted rather than a constant, or an element laid out one way comes back
    // laid out another.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const visible = signal(true)
    const view = createElement('view')
    insert(engine.pageElement, view, null)
    applyStyle(view, { display: 'block', width: 20 })

    bindShow(view, visible)
    visible(false)
    visible(true)

    expect(stylesOf(engine)).toEqual({ display: 'block', width: '20px' })
  })

  it('stops updating once the returned dispose is called', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const visible = signal(true)
    const view = createElement('view')
    insert(engine.pageElement, view, null)

    const dispose = bindShow(view, visible)
    dispose()
    visible(false)

    expect('display' in stylesOf(engine)).toBe(false)
  })

  it('stops updating when the enclosing scope is disposed', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const visible = signal(true)
    const view = createElement('view')
    insert(engine.pageElement, view, null)

    const dispose = effectScope(() => {
      bindShow(view, visible)
    })
    dispose()
    visible(false)

    expect('display' in stylesOf(engine)).toBe(false)
  })
})
