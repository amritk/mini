import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, mount, setEngine } from '../index'
import { createFakeEngine, type FakeElement } from '../testing/create-fake-engine'
import { avoidKeyboard, focusedField } from './avoid-keyboard'

/** The tree from the case that is running — the claimed field is module state, so it has to go. */
let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
  clearEngine()
})

/**
 * The fake engine's nodes ARE the elements the runtime holds — one object, two
 * spellings — so a field found in the tree can be compared to the one the
 * module claimed.
 */
const claimed = (element: FakeElement | undefined): boolean => focusedField() === (element as unknown)

describe('avoid-keyboard', () => {
  it('claims the field when it takes focus', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    dispose = mount(engine.pageElement, () => <input ref={avoidKeyboard} />)
    const input = engine.find('input') as FakeElement
    engine.dispatch(input, 'focus')

    expect(claimed(input)).toBe(true)
  })

  it('has no field before anything is focused', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    dispose = mount(engine.pageElement, () => <input ref={avoidKeyboard} />)

    expect(focusedField()).toBeNull()
  })

  it('moves the claim to whichever field was focused last', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    dispose = mount(engine.pageElement, () => (
      <view>
        <input ref={avoidKeyboard} />
        <input ref={avoidKeyboard} />
      </view>
    ))
    const [email, password] = engine.findAll('input')
    engine.dispatch(email as FakeElement, 'focus')
    engine.dispatch(password as FakeElement, 'focus')

    expect(claimed(password)).toBe(true)
  })

  it('registers no blur listener at all', () => {
    // Reacting to blur is the bug this module exists to avoid: moving between
    // two fields fires the first one's blur and the second one's focus in an
    // order nobody controls, so a layout that cleared on blur would drop to rest
    // and lift again between two adjacent taps.
    const engine = createFakeEngine()
    setEngine(engine.api)

    dispose = mount(engine.pageElement, () => <input ref={avoidKeyboard} />)

    expect([...(engine.find('input') as FakeElement).events.keys()]).toEqual(['bindEvent:focus'])
  })

  it('drops the claim when the field leaves the tree', () => {
    // A popped screen must not leave the runtime holding an element nothing
    // renders — the next lift would then be measured against it.
    const engine = createFakeEngine()
    setEngine(engine.api)

    dispose = mount(engine.pageElement, () => <input ref={avoidKeyboard} />)
    engine.dispatch(engine.find('input') as FakeElement, 'focus')
    expect(focusedField()).not.toBeNull()

    dispose()
    dispose = undefined

    expect(focusedField()).toBeNull()
  })
})
