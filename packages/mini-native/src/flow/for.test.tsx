import { afterEach, describe, expect, it } from 'vitest'

import { clearWorklets } from '../events/worklet-registry'
import { clearEngine, mount, onCleanup, setEngine, signal } from '../index'
import { createFakeEngine, type FakeElement, type FakeEngine } from '../testing/create-fake-engine'
import { serializeTree } from '../testing/serialize-tree'
import type { ForProps } from './for'
import { For } from './for'

type Row = { id: string; label: string }

afterEach(() => {
  clearEngine()
  clearWorklets()
})

/**
 * The label of every row, which is what the ordering assertions care about.
 *
 * A row here is a `<text>` and the string it shows lives one level further
 * down: Lynx has no text nodes, so a run of text is a `raw-text` ELEMENT
 * carrying the string in its `text` attribute.
 */
const rows = (container: FakeElement): string[] =>
  container.children.map((row) => String(row.children[0]?.attrs['text'] ?? ''))

/** The container `For` rendered into, which is the mounted tree's only child. */
const containerOf = (engine: FakeEngine): FakeElement => engine.page.children[0] as FakeElement

describe('for', () => {
  it('renders a row per item into a wrapper container', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const items = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
    ])

    mount(engine.pageElement, () => <For each={items}>{(row: Row) => <text>{row.label}</text>}</For>)

    expect(containerOf(engine).tag).toBe('wrapper')
    expect(rows(containerOf(engine))).toEqual(['alpha', 'beta'])
  })

  it('renders into a real element when `as` is given', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const items = signal<Row[]>([{ id: 'a', label: 'alpha' }])

    mount(engine.pageElement, () => (
      <For each={items} as="scroll-view" class="rows">
        {(row: Row) => <text>{row.label}</text>}
      </For>
    ))

    const container = containerOf(engine)
    expect(container.tag).toBe('scroll-view')
    // `class` is its own PAPI call rather than an attribute, so it lands here.
    expect(container.classes).toBe('rows')
  })

  it('typechecks a container prop against the tag `as` names', () => {
    // The payoff of a vocabulary derived from the engine's own types: the
    // container is not a curated subset that has to name every prop it is
    // willing to forward, so anything a `scroll-view` genuinely accepts is
    // reachable — and checked.
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () => (
      <For each={['a']} as="scroll-view" scroll-orientation="horizontal">
        {(tag: string) => <text>{tag}</text>}
      </For>
    ))

    expect(containerOf(engine).attrs['scroll-orientation']).toBe('horizontal')
  })

  it('rejects a container prop the named tag does not have', () => {
    // The other half of the same guarantee, and the half worth pinning: a
    // misspelling used to reach the engine as an attribute nothing reads, which
    // on a device looks like the prop simply not working.
    const props: ForProps<string, 'scroll-view'> = {
      each: ['a'],
      as: 'scroll-view',
      // @ts-expect-error — `scroll-orientaton` is a typo for `scroll-orientation`
      'scroll-orientaton': 'horizontal',
      children: (tag) => <text>{tag}</text>,
    }

    expect(props.as).toBe('scroll-view')
  })

  it('honours a `key` written as a JSX attribute', () => {
    // `key` is reserved by JSX: the transform hoists it out of the props object
    // into the runtime's third parameter before a component is ever called. A
    // runtime that drops it there leaves `For` silently falling back to
    // `defaultKey`, which surfaces later as rows that mysteriously do not
    // update rather than as any kind of error. `jsx` forwards it for component
    // tags precisely so this reads the way it looks.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const items = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
    ])
    const disposed: string[] = []

    mount(engine.pageElement, () => (
      <For each={items} key={(row: Row) => row.label}>
        {(row: Row) => {
          onCleanup(() => disposed.push(row.id))
          return <text>{row.label}</text>
        }}
      </For>
    ))

    // Keying on the label rather than the id means changing the label — while
    // the id stays put — is a new identity and disposes the old row. With the
    // key dropped, `defaultKey` would have keyed on `id` and nothing would be
    // disposed at all.
    items([{ id: 'a', label: 'renamed' }, items()[1] as Row])

    expect(disposed).toEqual(['a'])
    expect(rows(containerOf(engine))).toEqual(['renamed', 'beta'])
  })

  it('keys by item identity so a reorder reuses the nodes', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const items = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
    ])

    mount(engine.pageElement, () => <For each={items}>{(row: Row) => <text>{row.label}</text>}</For>)
    const [first, second] = containerOf(engine).children

    items([items()[1] as Row, items()[0] as Row])

    expect(containerOf(engine).children).toEqual([second, first])
  })

  it('keeps a moved row wired to its own handler', () => {
    // A reorder repositions the node rather than rebuilding it, so the listener
    // the row installed has to travel with it. Dispatch goes through the engine
    // and the global `runWorklet` exactly as a device would, so this covers the
    // handle surviving the move rather than just a closure still being in scope.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const items = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
    ])
    const tapped: string[] = []

    mount(engine.pageElement, () => (
      <For each={items}>{(row: Row) => <text bindtap={() => tapped.push(row.id)}>{row.label}</text>}</For>
    ))

    items([items()[1] as Row, items()[0] as Row])
    engine.dispatch(containerOf(engine).children[0] as FakeElement, 'tap')

    expect(tapped).toEqual(['b'])
  })

  it('disposes a row when its item leaves the collection', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const items = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
    ])
    const disposed: string[] = []

    mount(engine.pageElement, () => (
      <For each={items}>
        {(row: Row) => {
          onCleanup(() => disposed.push(row.id))
          return <text>{row.label}</text>
        }}
      </For>
    ))

    items([items()[0] as Row])

    expect(disposed).toEqual(['b'])
    expect(rows(containerOf(engine))).toEqual(['alpha'])
  })

  it('disposes every row when the mounted tree goes away', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const items = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
    ])
    const disposed: string[] = []

    const dispose = mount(engine.pageElement, () => (
      <For each={items}>
        {(row: Row) => {
          onCleanup(() => disposed.push(row.id))
          return <text>{row.label}</text>
        }}
      </For>
    ))
    dispose()

    expect(disposed).toEqual(['a', 'b'])
  })

  it('carries accessibility semantics on the `as` container', () => {
    // The container is how an accessible collection is expressed, and it needs
    // a real element to land on — the default wrapper is not in the
    // accessibility tree at all. Lynx spells this `accessibility-element` plus
    // `accessibility-label`; there is no `list` role in its vocabulary, which is
    // why nothing here pretends otherwise.
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () => (
      <For each={['a', 'b']} as="view" accessibility-element accessibility-label="tags">
        {(tag: string) => <text accessibility-element>{tag}</text>}
      </For>
    ))

    expect(serializeTree(containerOf(engine))).toBe(
      [
        '<view accessibility-element=true accessibility-label="tags">',
        '  <text accessibility-element=true>',
        '    <raw-text text="a">',
        '  <text accessibility-element=true>',
        '    <raw-text text="b">',
      ].join('\n'),
    )
  })

  it('leaves the default container out of layout and the accessibility tree', () => {
    // Nobody wrote this element, so it must not change what the tree MEANS. A
    // `view` would: a `For` inside a flex row would become one flex item
    // instead of many, and the container would sit between a collection and its
    // rows for a screen reader. Lynx's `wrapper` is transparent to both, so the
    // runtime uses the engine's own answer instead of approximating it with
    // attributes on a real box, which is what the old multi-target version had
    // to do on every host.
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () => <For each={['a']}>{(tag: string) => <text>{tag}</text>}</For>)

    const container = containerOf(engine)
    expect(container.tag).toBe('wrapper')
    // Nothing to hide behind, and nothing hidden: no box, no attributes, no
    // classes. There is simply no node here for layout or assistive technology.
    expect([container.attrs, container.styles, container.classes]).toEqual([{}, {}, ''])
  })

  it('rejects accessibility props with no container to land on', () => {
    // This used to be a runtime warning, because the container was always a real
    // element and dropping the role silently would have left a collection
    // reading as a plain group. With the vocabulary typed from the engine the
    // wrapper genuinely declares no such prop, so the same mistake is a compile
    // error — caught earlier, and without needing a screen reader to notice.
    const props: ForProps<string> = {
      each: ['a'],
      // @ts-expect-error — the default `wrapper` container carries no accessibility props
      'accessibility-label': 'tags',
      children: (tag) => <text>{tag}</text>,
    }

    expect(props.each).toEqual(['a'])
  })
})
