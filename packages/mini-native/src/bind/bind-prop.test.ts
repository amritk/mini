import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { effectScope, signal } from '../signals'
import { createFakeEngine, type FakeEngine } from '../testing/create-fake-engine'
import { createElement, insert } from '../tree'
import { bindProp } from './bind-prop'

afterEach(() => {
  clearEngine()
})

/**
 * An `<input>` already in the tree, which is where a binding would find one —
 * and what lets the assertions below look it up through the engine rather than
 * through the handle they were given.
 */
const mountInput = (engine: FakeEngine): LynxElement => {
  const input = createElement('input')
  insert(engine.pageElement, input, null)
  return input
}

/** The attributes the engine currently holds for the mounted control. */
const attrsOf = (engine: FakeEngine): Record<string, unknown> => engine.find('input')?.attrs ?? {}

describe('bind-prop', () => {
  it('writes the attribute during setup', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const input = mountInput(engine)

    bindProp(input, 'placeholder', () => 'your name')

    expect(attrsOf(engine)['placeholder']).toBe('your name')
  })

  it('rewrites the attribute whenever the signal changes', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const input = mountInput(engine)
    const placeholder = signal('before')

    bindProp(input, 'placeholder', placeholder)
    placeholder('after')

    expect(attrsOf(engine)['placeholder']).toBe('after')
  })

  it('clears the attribute when the value turns into an unset sentinel', () => {
    // `false`, `null`, and `undefined` all mean "clear it", which is what lets
    // this one helper cover the engine's boolean attributes without a second
    // binding that knows about attribute presence.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const input = mountInput(engine)
    const disabled = signal<unknown>(true)

    bindProp(input, 'disabled', disabled)
    expect(attrsOf(engine)['disabled']).toBe(true)

    for (const sentinel of [false, null, undefined]) {
      disabled(true)
      disabled(sentinel)
      expect('disabled' in attrsOf(engine)).toBe(false)
    }
  })

  it('uses the engine spelling of the attribute rather than a translated one', () => {
    // There is no translation table in this package: an attribute is written
    // exactly as Lynx names it, so a kebab-case engine attribute has to survive
    // the binding untouched.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const input = mountInput(engine)

    bindProp(input, 'confirm-type', () => 'done')

    expect(attrsOf(engine)['confirm-type']).toBe('done')
  })

  it('stops updating once the returned dispose is called', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const input = mountInput(engine)
    const placeholder = signal('before')

    const dispose = bindProp(input, 'placeholder', placeholder)
    dispose()
    placeholder('after')

    expect(attrsOf(engine)['placeholder']).toBe('before')
  })

  it('stops updating when the enclosing scope is disposed', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const input = mountInput(engine)
    const placeholder = signal('before')

    const dispose = effectScope(() => {
      bindProp(input, 'placeholder', placeholder)
    })
    dispose()
    placeholder('after')

    expect(attrsOf(engine)['placeholder']).toBe('before')
  })
})
