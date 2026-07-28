import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { effectScope, signal } from '../signals'
import { createFakeEngine, type FakeElement, type FakeEngine } from '../testing/create-fake-engine'
import { createElement, insert } from '../tree'
import { bindValue } from './bind-value'

afterEach(() => {
  clearEngine()
})

/** An `<input>` in the tree, plus the engine-side node the assertions read. */
const mountInput = (engine: FakeEngine): { element: LynxElement; node: FakeElement } => {
  const element = createElement('input')
  insert(engine.pageElement, element, null)
  return { element, node: engine.find('input') as FakeElement }
}

/**
 * Simulates typing, the way the engine reports it.
 *
 * The value arrives in the event payload rather than on the element, because a
 * Lynx `<input>` is a real native control: what the user types never lands back
 * on the element tree.
 */
const type = (engine: FakeEngine, node: FakeElement, value: string, isComposing = false): void => {
  engine.dispatch(node, 'input', { detail: { value, isComposing } })
}

/** How many listeners the engine is holding for an element. */
const listenerCount = (node: FakeElement): number => node.events.size

describe('bind-value', () => {
  it('writes the signal value onto the control during setup', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)

    bindValue(element, signal('hello'))

    expect(node.attrs['value']).toBe('hello')
  })

  it('follows the signal downwards as it changes', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)
    const model = signal('before')

    bindValue(element, model)
    model('after')

    expect(node.attrs['value']).toBe('after')
  })

  it('writes the signal back when the control reports input', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)
    const model = signal('')

    bindValue(element, model)
    type(engine, node, 'typed')

    expect(model()).toBe('typed')
  })

  it('reads a payload with no value back as an empty string', () => {
    // Clearing a control can legitimately report nothing at all, and the signal
    // has to end up a string either way rather than leaking `undefined` into a
    // form's values.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)
    const model = signal('hello')

    bindValue(element, model)
    engine.dispatch(node, 'input', {})

    expect(model()).toBe('')
  })

  it('does not echo the character the user just typed back onto the control', () => {
    // Writing the value back when the control already shows it repositions the
    // caret to the end of the field, so a word typed in the middle of existing
    // text scatters. The inequality guard is what keeps typing feeling normal.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)
    const model = signal('')

    bindValue(element, model)
    engine.clearCalls()
    type(engine, node, 'ab')

    expect(model()).toBe('ab')
    expect(engine.calls().filter((call) => call.includes('"value"'))).toEqual([])
  })

  it('still writes the control when the signal changes from elsewhere', () => {
    // The other half of the guard: it must suppress only the echo, never a
    // genuine programmatic change.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)
    const model = signal('')

    bindValue(element, model)
    engine.clearCalls()
    model('reset by the app')

    expect(engine.calls().filter((call) => call.includes('"value"'))).toHaveLength(1)
    expect(node.attrs['value']).toBe('reset by the app')
  })

  it('holds the signal still while an IME composition is in flight', () => {
    // An IME emits an input event for every intermediate candidate while
    // composing CJK or accented text, flagged with `isComposing`. Writing those
    // through would tear the candidate string apart.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)
    const model = signal('')

    bindValue(element, model)
    type(engine, node, 'にほn', true)

    expect(model()).toBe('')
  })

  it('commits the composed text once the composition settles', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)
    const model = signal('')

    bindValue(element, model)
    type(engine, node, 'にほn', true)
    type(engine, node, 'にほん')

    expect(model()).toBe('にほん')
  })

  it('leaves the control alone while a composition is in flight', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)
    const model = signal('')

    bindValue(element, model)
    type(engine, node, 'partial', true)
    engine.clearCalls()
    model('written by the app')

    expect(engine.calls().filter((call) => call.includes('"value"'))).toEqual([])
  })

  it('applies a write that arrived mid-composition once the composition settles', () => {
    // The control is deliberately left alone during a composition, but the write
    // must not be lost with it. Reading the control back instead would make the
    // model agree with it again, leaving the tracking effect nothing to
    // re-apply — and the app's write would vanish without trace.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)
    const model = signal('')

    bindValue(element, model)
    type(engine, node, 'partial', true)
    model('cleared by the app')
    type(engine, node, 'にほん')

    expect(node.attrs['value']).toBe('cleared by the app')
    expect(model()).toBe('cleared by the app')
  })

  it('resumes committing after a composition settles', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)
    const model = signal('')

    bindValue(element, model)
    type(engine, node, 'a', true)
    type(engine, node, 'ab')
    type(engine, node, 'plain')

    expect(model()).toBe('plain')
  })

  it('detaches the listener when the enclosing scope is disposed', () => {
    // The documented way to reach this binding is from a `ref`, where the
    // returned dispose is never called by hand and teardown is left entirely to
    // the scope. Left attached, the engine keeps calling a dispatcher for an
    // element nobody can see.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)

    const dispose = effectScope(() => {
      bindValue(element, signal(''))
    })
    expect(listenerCount(node)).toBe(1)

    dispose()

    expect(listenerCount(node)).toBe(0)
  })

  it('detaches the listener when the returned dispose is called by hand', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)

    const dispose = bindValue(element, signal(''))
    dispose()

    expect(listenerCount(node)).toBe(0)
  })

  it('survives being disposed by hand and by the scope', () => {
    // Both paths can legitimately fire for the same binding, and an effect's
    // cleanup runs at most once, so doing both has to be harmless.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)
    // effectScope runs its body synchronously, so the assignment is definite —
    // just invisible to the compiler, hence the non-null claim.
    let byHand!: () => void

    const disposeScope = effectScope(() => {
      byHand = bindValue(element, signal(''))
    })

    expect(() => {
      byHand()
      disposeScope()
    }).not.toThrow()
    expect(listenerCount(node)).toBe(0)
  })

  it('stops following the signal once disposed', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const { element, node } = mountInput(engine)
    const model = signal('before')

    const dispose = bindValue(element, model)
    dispose()
    model('after')

    expect(node.attrs['value']).toBe('before')
  })
})
