import { afterEach, describe, expect, it } from 'vitest'

import { appendChildren } from '../append-children'
import { clearEngine, setEngine } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { mount } from '../mount'
import { effectScope, signal } from '../signals'
import { createFakeEngine, type FakeElement } from '../testing/create-fake-engine'
import { serializeTree } from '../testing/serialize-tree'
import { createElement, insert } from '../tree'
import { Portal } from './portal'

afterEach(() => {
  clearEngine()
})

/** A `<text>` holding one run, static or reactive. */
const text = (value: string | (() => string)): LynxElement => {
  const element = createElement('text')
  appendChildren(element, value)
  return element
}

/** The engine-side node behind an opaque handle, so a test can serialise it. */
const asFake = (element: LynxElement): FakeElement => element as unknown as FakeElement

describe('portal', () => {
  it('renders its children into the target instead of in place', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const overlays = createElement('overlay')

    mount(engine.pageElement, () => Portal({ target: overlays, children: text('sheet') }))

    expect(serializeTree(asFake(overlays))).toContain('"sheet"')
    expect(serializeTree(engine.page)).not.toContain('"sheet"')
  })

  it('leaves a wrapper where it was written', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const overlays = createElement('overlay')

    mount(engine.pageElement, () => Portal({ target: overlays, children: text('sheet') }))

    // Nobody wrote this element, so it must not appear to have been written. A
    // wrapper holds the place without taking part in layout or in the
    // accessibility tree, which is exactly what that needs.
    expect(engine.page.children[0]?.tag).toBe('wrapper')
  })

  it('takes the moved subtree with it when its place in the tree goes away', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const overlays = createElement('overlay')

    // A scope standing in for the branch of a conditional: this is what `Show`
    // disposes when its condition flips.
    const dispose = effectScope(() => {
      insert(engine.pageElement, Portal({ target: overlays, children: text('sheet') }), null)
    })
    expect(serializeTree(asFake(overlays))).toContain('"sheet"')

    dispose()

    // The whole reason a wrapper stays behind: it ties the moved subtree's
    // lifetime to the place that wrote it. Without that a dismissed sheet would
    // stay parked in the overlay root with its bindings still live.
    expect(serializeTree(asFake(overlays))).not.toContain('"sheet"')
  })

  it('disposes with the mount that created it', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const overlays = createElement('overlay')

    const dispose = mount(engine.pageElement, () => Portal({ target: overlays, children: text('sheet') }))

    dispose()

    expect(asFake(overlays).children).toHaveLength(0)
  })

  it('keeps the subtree reactive after the move', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const overlays = createElement('overlay')
    const label = signal('one')

    mount(engine.pageElement, () => Portal({ target: overlays, children: text(() => label()) }))

    label('two')

    // Moving a node between parents must not disturb what it is bound to —
    // exactly the kind of thing that looks fine and quietly stops updating.
    expect(serializeTree(asFake(overlays))).toContain('"two"')
  })
})
