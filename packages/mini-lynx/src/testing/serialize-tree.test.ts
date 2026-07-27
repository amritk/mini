import { afterEach, describe, expect, it } from 'vitest'

import { clearWorklets, registerWorklet } from '../events/worklet-registry'
import { createFakeEngine, type FakeElement } from './create-fake-engine'
import { serializeTree } from './serialize-tree'

/**
 * The text form the rest of the suite asserts against, so its output has to be
 * STABLE — anything that moved with the order props happened to be written in
 * would make every snapshot a hostage to an unrelated refactor.
 */

/** The in-memory node behind an opaque handle, for the calls that hand one back. */
const fake = (element: unknown): FakeElement => element as FakeElement

afterEach(() => {
  clearWorklets()
})

describe('serialize-tree', () => {
  it('renders a tree as indented text, showing everything a test asserts on', () => {
    // Tag, id, classes, attributes, styles and bound events. Parent links are
    // relationships rather than rendered output, and the call log is a separate
    // question.
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)
    engine.api.__SetID(view, 'root')
    engine.api.__SetClasses(view, 'card wide')
    engine.api.__SetAttribute(view, 'mode', 'cover')
    engine.api.__SetInlineStyles(view, { width: '10px', color: 'red' })
    engine.api.__AddEvent(
      view,
      'bindEvent',
      'tap',
      registerWorklet(() => {}),
    )
    engine.api.__AppendElement(engine.pageElement, view)
    const text = engine.api.__CreateElement('text', 0)
    engine.api.__AppendElement(view, text)
    engine.api.__AppendElement(text, engine.api.__CreateRawText('hello'))

    expect(serializeTree(engine.page)).toBe(
      [
        '<page>',
        '  <view #root .card.wide mode="cover" style="color: red; width: 10px" @tap>',
        '    <text>',
        '      <raw-text text="hello">',
      ].join('\n'),
    )
  })

  it('shows a text run as the element it really is', () => {
    // The honest way to show what a device would build: a `<text>` really does
    // hold a `raw-text` child rather than carrying a string property.
    const engine = createFakeEngine()
    const text = engine.api.__CreateElement('text', 0)
    engine.api.__AppendElement(text, engine.api.__CreateRawText('hello'))

    expect(serializeTree(fake(text))).toBe(['<text>', '  <raw-text text="hello">'].join('\n'))
  })

  it('leaves out every part an element does not have', () => {
    const engine = createFakeEngine()

    expect(serializeTree(fake(engine.api.__CreateElement('view', 0)))).toBe('<view>')
  })

  it('sorts attributes and declarations so the output does not depend on write order', () => {
    const written = createFakeEngine()
    const reversed = createFakeEngine()
    const a = written.api.__CreateElement('view', 0)
    const b = reversed.api.__CreateElement('view', 0)

    written.api.__SetAttribute(a, 'alpha', 1)
    written.api.__SetAttribute(a, 'beta', 2)
    written.api.__SetInlineStyles(a, { width: '1px', color: 'red' })
    reversed.api.__SetAttribute(b, 'beta', 2)
    reversed.api.__SetAttribute(b, 'alpha', 1)
    reversed.api.__SetInlineStyles(b, { color: 'red', width: '1px' })

    expect(serializeTree(fake(a))).toBe(serializeTree(fake(b)))
  })

  it('shows the propagation type of every bound event', () => {
    // Which events an element carries is the part worth reading, and the type
    // prefix is what distinguishes a `catch` from a `bind` — a difference that
    // decides whether a tap reaches an ancestor.
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)
    engine.api.__AddEvent(
      view,
      'bindEvent',
      'tap',
      registerWorklet(() => {}),
    )
    engine.api.__AddEvent(
      view,
      'catchEvent',
      'longpress',
      registerWorklet(() => {}),
    )
    engine.api.__AddEvent(
      view,
      'capture-bind',
      'tap',
      registerWorklet(() => {}),
    )

    expect(serializeTree(fake(view))).toBe('<view @catch:longpress @tap capture-bind:tap>')
  })

  it('indents from a caller-supplied depth', () => {
    const engine = createFakeEngine()

    expect(serializeTree(fake(engine.api.__CreateElement('view', 0)), 2)).toBe('    <view>')
  })
})
