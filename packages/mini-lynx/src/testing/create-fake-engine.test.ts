import { afterEach, describe, expect, it } from 'vitest'

import { clearWorklets, registerWorklet } from '../events/worklet-registry'
import { createFakeEngine, type FakeElement } from './create-fake-engine'

/**
 * The fake deserves its own suite because everything else in the package trusts
 * it. A fake that quietly smoothed over one of the engine's constraints would
 * make the very bug that constraint causes untestable — so each constraint it
 * reproduces on purpose is pinned here, alongside the tree bookkeeping the rest
 * of the suite reads back out of it.
 */

/** The in-memory node behind an opaque handle, for the calls that hand one back. */
const fake = (element: unknown): FakeElement => element as FakeElement

afterEach(() => {
  clearWorklets()
})

describe('create-fake-engine', () => {
  it('gives every engine its own tree and its own log', () => {
    const first = createFakeEngine()
    const second = createFakeEngine()

    first.api.__AppendElement(first.pageElement, first.api.__CreateElement('view', 0))

    expect(first.page.children).toHaveLength(1)
    expect(second.page.children).toHaveLength(0)
    expect(second.calls()).toEqual([])
  })

  it('reports the last thousand calls however many it has seen', () => {
    // The log is trimmed in batches rather than on every call, because trimming
    // eagerly costs an array copy per engine call and makes the fake, rather
    // than the runtime, the thing its own benchmark measures. The slack that
    // buys has to stay invisible: whatever the trim is doing internally, a
    // caller sees a thousand entries and they are the most recent thousand.
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)

    for (let index = 0; index < 5000; index++) engine.api.__SetAttribute(view, 'index', index)

    const calls = engine.calls()

    expect(calls).toHaveLength(1000)
    expect(calls[999]).toBe(`__SetAttribute(#${fake(view).id}, "index", 4999)`)
    expect(calls[0]).toBe(`__SetAttribute(#${fake(view).id}, "index", 4000)`)
  })

  it('keeps one listener per type and name, overwriting silently', () => {
    // The engine's real constraint, reproduced rather than smoothed over.
    // Working around it is `add-event.ts`'s job, and a fake that allowed many
    // listeners would make the bug it exists to prevent untestable.
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)
    const fired: string[] = []
    const first = registerWorklet(() => fired.push('first'))
    const second = registerWorklet(() => fired.push('second'))

    engine.api.__AddEvent(view, 'bindEvent', 'tap', first)
    engine.api.__AddEvent(view, 'bindEvent', 'tap', second)
    engine.api.__AppendElement(engine.pageElement, view)
    engine.dispatch(fake(view), 'tap')

    expect(fake(view).events.size).toBe(1)
    expect(fired).toEqual(['second'])
  })

  it('throws when handed a raw function as a listener', () => {
    // A device engine accepts one, stores it, and then never invokes it on the
    // fiber architecture — a tap produces a log line in native and nothing else.
    // Throwing here is the whole point of testing against a faithful fake: the
    // mistake fails in a test rather than on a phone.
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)

    expect(() => engine.api.__AddEvent(view, 'bindEvent', 'tap', (() => {}) as never)).toThrow(
      /must be a string or a worklet handle/,
    )
  })

  it('dispatches a worklet handle through the global runWorklet', () => {
    // The engine's own indirection, reproduced. Reaching for a stored closure
    // instead would leave the registry an untested path in the one suite that
    // could have covered it.
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)
    const received: unknown[] = []
    engine.api.__AddEvent(
      view,
      'bindEvent',
      'tap',
      registerWorklet((event) => received.push(event)),
    )
    engine.api.__AppendElement(engine.pageElement, view)

    engine.dispatch(fake(view), 'tap', { detail: { x: 3 } })

    expect(received).toEqual([{ detail: { x: 3 } }])
  })

  it('records a string listener as a published event rather than dropping it', () => {
    // This runtime never registers one, so an entry here means something else
    // did — worth being able to assert on.
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)
    engine.api.__AddEvent(view, 'bindEvent', 'tap', 'handleTap')

    engine.dispatch(fake(view), 'tap', { id: 1 })

    expect(engine.publishedEvents()).toEqual([{ handler: 'handleTap', event: { id: 1 } }])
  })

  it('dispatching to an element with no listener does nothing', () => {
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)

    expect(() => engine.dispatch(fake(view), 'tap')).not.toThrow()
  })

  it('removes an attribute when the value is null', () => {
    // The engine's own rule, and the one `applyProp` leans on to make `false`
    // mean absence.
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)

    engine.api.__SetAttribute(view, 'mode', 'cover')
    expect(engine.api.__GetAttributes(view)).toEqual({ mode: 'cover' })

    engine.api.__SetAttribute(view, 'mode', null)

    expect(engine.api.__GetAttributes(view)).toEqual({})
  })

  it('keeps false and zero as attribute values rather than removing them', () => {
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)

    engine.api.__SetAttribute(view, 'flag', false)
    engine.api.__SetAttribute(view, 'count', 0)

    expect(engine.api.__GetAttributes(view)).toEqual({ flag: false, count: 0 })
  })

  it('replaces every inline style wholesale', () => {
    // The reason `apply-style.ts` has to remember visibility separately: this
    // write takes the whole channel with it.
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)
    engine.api.__SetInlineStyles(view, { width: '10px', height: '20px' })

    engine.api.__SetInlineStyles(view, { width: '30px' })

    expect(fake(view).styles).toEqual({ width: '30px' })
  })

  it('empties the declarations when handed CSS text', () => {
    // Parsing CSS is not this fake's job — a test that needs to assert on
    // declarations passes the map form.
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)
    engine.api.__SetInlineStyles(view, { width: '10px' })

    engine.api.__SetInlineStyles(view, 'width:30px')

    expect(fake(view).styles).toEqual({})
    expect(engine.calls()).toContain(`__SetInlineStyles(#${fake(view).id}, "width:30px")`)
  })

  it('merges one declaration without disturbing the rest', () => {
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)
    engine.api.__SetInlineStyles(view, { width: '10px' })

    engine.api.__AddInlineStyle(view, 'display', 'none')

    expect(fake(view).styles).toEqual({ width: '10px', display: 'none' })
  })

  it('removes a merged declaration when its value goes away', () => {
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)
    engine.api.__AddInlineStyle(view, 'display', 'none')

    engine.api.__AddInlineStyle(view, 'display', null)

    expect(fake(view).styles).toEqual({})
  })

  it('detaches a node from its previous parent on append', () => {
    const engine = createFakeEngine()
    const from = engine.api.__CreateElement('view', 0)
    const to = engine.api.__CreateElement('view', 0)
    const node = engine.api.__CreateElement('text', 0)
    engine.api.__AppendElement(from, node)

    engine.api.__AppendElement(to, node)

    expect(fake(from).children).toHaveLength(0)
    expect(fake(to).children).toEqual([fake(node)])
  })

  it('appends when __InsertElementBefore is given no anchor', () => {
    const engine = createFakeEngine()
    const parent = engine.api.__CreateElement('view', 0)
    const first = engine.api.__CreateElement('text', 0)
    const second = engine.api.__CreateElement('image', 0)
    engine.api.__AppendElement(parent, first)

    engine.api.__InsertElementBefore(parent, second)

    expect(fake(parent).children.map((child) => child.tag)).toEqual(['text', 'image'])
  })

  it('leaves the tree alone when removing through the wrong parent', () => {
    const engine = createFakeEngine()
    const parent = engine.api.__CreateElement('view', 0)
    const stranger = engine.api.__CreateElement('view', 0)
    const node = engine.api.__CreateElement('text', 0)
    engine.api.__AppendElement(parent, node)

    engine.api.__RemoveElement(stranger, node)

    expect(fake(parent).children).toEqual([fake(node)])
  })

  it('walks parents, children and siblings', () => {
    const engine = createFakeEngine()
    const parent = engine.api.__CreateElement('view', 0)
    const first = engine.api.__CreateElement('text', 0)
    const second = engine.api.__CreateElement('image', 0)
    engine.api.__AppendElement(parent, first)
    engine.api.__AppendElement(parent, second)

    expect(engine.api.__GetParent(first)).toBe(parent)
    expect(engine.api.__GetChildren(parent)).toEqual([first, second])
    expect(engine.api.__FirstElement(parent)).toBe(first)
    expect(engine.api.__NextElement(first)).toBe(second)
    expect(engine.api.__NextElement(second)).toBeNull()
    expect(engine.api.__GetParent(parent)).toBeNull()
  })

  it('hands out element ids above zero', () => {
    // Engine ids start well above zero, and code that treats zero as "no
    // component" is the bug `componentId()` exists to prevent — so the fake
    // starts high enough that such code fails here too.
    const engine = createFakeEngine()

    expect(engine.api.__GetElementUniqueID?.(engine.pageElement)).toBeGreaterThan(0)
  })

  it('counts commits', () => {
    const engine = createFakeEngine()

    engine.api.__FlushElementTree()
    engine.api.__FlushElementTree()

    expect(engine.flushes()).toBe(2)
  })

  it('logs every call in order and clears on request', () => {
    const engine = createFakeEngine()
    const view = engine.api.__CreateElement('view', 0)

    engine.api.__SetClasses(view, 'card')
    expect(engine.calls()).toEqual(['__CreateElement("view", 0) → #1', `__SetClasses(#${fake(view).id}, "card")`])

    engine.clearCalls()

    expect(engine.calls()).toEqual([])
  })

  it('trims the log rather than growing forever', () => {
    const engine = createFakeEngine()

    for (let i = 0; i < 1500; i++) engine.api.__FlushElementTree()

    expect(engine.calls()).toHaveLength(1000)
  })

  it('finds elements by tag and by test id', () => {
    const engine = createFakeEngine()
    const first = engine.api.__CreateElement('view', 0)
    const second = engine.api.__CreateElement('view', 0)
    engine.api.__SetAttribute(second, 'data-testid', 'row')
    engine.api.__AppendElement(engine.pageElement, first)
    engine.api.__AppendElement(first, second)

    expect(engine.find('view')).toBe(fake(first))
    expect(engine.findAll('view')).toEqual([fake(first), fake(second)])
    expect(engine.findByTestId('row')).toBe(fake(second))
    expect(engine.find('image')).toBeUndefined()
  })

  it('only finds what is attached to the page', () => {
    // A detached node is not in the tree, and a query that reached it would
    // report a screen nobody can see.
    const engine = createFakeEngine()
    engine.api.__CreateElement('view', 0)

    expect(engine.find('view')).toBeUndefined()
  })
})
