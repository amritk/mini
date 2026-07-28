import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from '../engine/current-engine'
import { effectScope, signal } from '../signals'
import { createFakeEngine, type FakeEngine } from '../testing/create-fake-engine'
import { createRawText, insert } from '../tree'
import { bindText } from './bind-text'

afterEach(() => {
  clearEngine()
})

/** The literal the engine currently holds for the mounted text run. */
const textOf = (engine: FakeEngine): unknown => engine.find('raw-text')?.attrs['text']

describe('bind-text', () => {
  it('writes the getter value into the run during setup', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const node = createRawText('')
    insert(engine.pageElement, node, null)

    bindText(node, () => 'hello')

    expect(textOf(engine)).toBe('hello')
  })

  it('rewrites the run whenever the signal changes', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const label = signal('before')
    const node = createRawText('')
    insert(engine.pageElement, node, null)

    bindText(node, label)
    label('after')

    expect(textOf(engine)).toBe('after')
  })

  it('updates the run in place rather than replacing it', () => {
    // A string is an ELEMENT in Lynx, so the cheap update is one attribute
    // write on the run that already exists. Replacing it would cost a create,
    // an insert and a remove for every keystroke.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const label = signal('before')
    const node = createRawText('')
    insert(engine.pageElement, node, null)

    bindText(node, label)
    label('after')

    expect(engine.findAll('raw-text')).toHaveLength(1)
  })

  it('stops updating once the returned dispose is called', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const label = signal('before')
    const node = createRawText('')
    insert(engine.pageElement, node, null)

    const dispose = bindText(node, label)
    dispose()
    label('after')

    expect(textOf(engine)).toBe('before')
  })

  it('stops updating when the enclosing scope is disposed', () => {
    // A binding is normally created deep inside a component and never disposed
    // by hand, so scope teardown is the path that actually runs in an app.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const label = signal('before')
    const node = createRawText('')
    insert(engine.pageElement, node, null)

    const dispose = effectScope(() => {
      bindText(node, label)
    })
    dispose()
    label('after')

    expect(textOf(engine)).toBe('before')
  })
})
