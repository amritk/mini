import { afterEach, describe, expect, it } from 'vitest'

import { appendChildren } from './append-children'
import { clearEngine, setEngine } from './engine/current-engine'
import type { LynxElement } from './engine/element-api'
import { signal } from './signals'
import { createFakeEngine, type FakeElement, type FakeEngine } from './testing/create-fake-engine'
import { serializeTree } from './testing/serialize-tree'
import { createElement } from './tree'
import type { MiniChildren } from './types'

/**
 * Children, and the one thing about them that is genuinely Lynx-shaped: a
 * string is an ELEMENT here, not a property of its parent. Everything else —
 * flattening, dropping the nullish values that make `&&` work, giving a reactive
 * child its own node — follows from that.
 */

const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

/** The in-memory node behind an opaque handle. */
const fake = (element: LynxElement): FakeElement => element as unknown as FakeElement

/** Installs a fresh engine and hands back a `<text>` to append into. */
const setup = (): { engine: FakeEngine; text: LynxElement } => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  const text = createElement('text')
  engine.clearCalls()
  return { engine, text }
}

/** The text each `raw-text` child is currently showing, in tree order. */
const runs = (element: LynxElement): unknown[] => fake(element).children.map((child) => child.attrs['text'])

afterEach(async () => {
  await tick()
  clearEngine()
})

describe('append-children', () => {
  it('builds a string child through the raw-text creator', () => {
    // `__CreateRawText` and not `__CreateElement('raw-text')`. The generic
    // creator would produce a node with no text on it, which renders as a gap
    // rather than as an error.
    const { engine, text } = setup()

    appendChildren(text, 'hello')

    expect(engine.calls().filter((line) => line.startsWith('__Create'))).toEqual(['__CreateRawText("hello") → #2'])
    expect(engine.calls().some((line) => line.includes('__CreateElement("raw-text"'))).toBe(false)
  })

  it('stringifies a number child', () => {
    const { text } = setup()

    appendChildren(text, 42)

    expect(runs(text)).toEqual(['42'])
  })

  it('moves an already-built element in as-is', () => {
    const { engine, text } = setup()
    const child = createElement('image')

    appendChildren(text, child as unknown as never)

    expect(fake(text).children).toEqual([fake(child)])
    expect(engine.calls()).toContain(`__AppendElement(#${fake(text).id}, #${fake(child).id})`)
  })

  it('gives a function child its own raw-text node', () => {
    const { text } = setup()
    const label = signal('before')

    appendChildren(text, ['left', () => label(), 'right'])

    expect(runs(text)).toEqual(['left', 'before', 'right'])
  })

  it('updates a reactive child in place without touching its siblings', () => {
    // The dedicated node is what makes this true. Sharing one run with the
    // static siblings would mean rewriting all three every time — on Lynx, the
    // difference between one attribute write and rebuilding a text run.
    const { engine, text } = setup()
    const label = signal('before')
    appendChildren(text, ['left', () => label(), 'right'])
    const reactive = fake(text).children[1] as FakeElement
    engine.clearCalls()

    label('after')

    expect(runs(text)).toEqual(['left', 'after', 'right'])
    // Node identity survives, so nothing was rebuilt.
    expect(fake(text).children[1]).toBe(reactive)
    expect(engine.calls().filter((line) => line.startsWith('__SetAttribute'))).toEqual([
      `__SetAttribute(#${reactive.id}, "text", "after")`,
    ])
  })

  it('renders a reactive child that resolves to nothing as an empty run', () => {
    // An empty run rather than a removed node: the slot has to stay put, or the
    // next value would come back in the wrong place among its siblings.
    const { text } = setup()
    const label = signal<string | null>('before')

    appendChildren(text, ['left', () => label()])
    label(null)

    expect(runs(text)).toEqual(['left', ''])
  })

  it('flattens nested arrays', () => {
    const { text } = setup()

    // Deeper than `MiniChildren` describes, on purpose. The type admits a child
    // or one flat array of them; the runtime recurses, and it has to — a mapped
    // array sitting beside another child is exactly the nested shape JSX
    // produces. The behaviour is the one worth pinning, so the value is widened
    // here rather than the coverage narrowed.
    appendChildren(text, ['a', ['b', ['c', 'd']], 'e'] as unknown as MiniChildren)

    expect(runs(text)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('drops null, undefined and booleans so && conditionals work', () => {
    // `{condition && <text>…</text>}` evaluates to `false` when the condition is
    // falsy, and that has to vanish rather than render as "false".
    const { text } = setup()

    appendChildren(text, [null, 'kept', undefined, false, true])

    expect(runs(text)).toEqual(['kept'])
  })

  it('appends nothing at all for a lone nullish child', () => {
    const { engine, text } = setup()

    appendChildren(text, null)
    appendChildren(text, undefined)
    appendChildren(text, false)

    expect(fake(text).children).toHaveLength(0)
    expect(engine.calls()).toEqual([])
  })

  it('appends children in the order they were written', () => {
    const { engine, text } = setup()

    appendChildren(text, ['one', 'two', 'three'])

    expect(serializeTree(fake(text))).toBe(
      ['<text>', '  <raw-text text="one">', '  <raw-text text="two">', '  <raw-text text="three">'].join('\n'),
    )
    expect(engine.flushes()).toBe(0)
  })
})
