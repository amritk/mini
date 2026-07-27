import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, onCleanup, setHost, signal } from '../index'
import { For } from './for'

type Row = { id: string; label: string }

afterEach(() => {
  clearHost()
})

/** The text of every row, which is what the ordering assertions care about. */
const rows = (container: MemoryElement): string[] =>
  container.children.map((child) => {
    const text = (child as MemoryElement).children[0]
    return text && text.kind === 'text' ? text.value : ''
  })

/** The container `For` rendered into, which is the mounted tree's only child. */
const containerOf = (memory: ReturnType<typeof createMemoryHost>): MemoryElement =>
  memory.root.children[0] as MemoryElement

describe('for', () => {
  it('renders a row per item into a flow wrapper', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const items = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
    ])

    mount(memory.rootElement, () => <For each={items}>{(row: Row) => <text>{row.label}</text>}</For>)

    expect(containerOf(memory).tag).toBe('flow')
    expect(rows(containerOf(memory))).toEqual(['alpha', 'beta'])
  })

  it('renders into a real element when `as` is given', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const items = signal<Row[]>([{ id: 'a', label: 'alpha' }])

    mount(memory.rootElement, () => (
      <For each={items} as="scroll-view" class="rows">
        {(row: Row) => <text>{row.label}</text>}
      </For>
    ))

    const container = containerOf(memory)
    expect(container.tag).toBe('scroll-view')
    expect(container.props['class']).toBe('rows')
  })

  it('honours a `key` written as a JSX attribute', () => {
    // `key` is reserved by JSX: the transform hoists it out of the props object
    // into the runtime's third parameter before a component is ever called. A
    // runtime that drops it there leaves `For` silently falling back to
    // `defaultKey`, which surfaces later as rows that mysteriously do not
    // update rather than as any kind of error. `jsx` forwards it for component
    // tags precisely so this reads the way it looks.
    const memory = createMemoryHost()
    setHost(memory.host)
    const items = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
    ])
    const disposed: string[] = []

    mount(memory.rootElement, () => (
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
    expect(rows(containerOf(memory))).toEqual(['renamed', 'beta'])
  })

  it('keys by item identity so a reorder reuses the nodes', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const items = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
    ])

    mount(memory.rootElement, () => <For each={items}>{(row: Row) => <text>{row.label}</text>}</For>)
    const [first, second] = containerOf(memory).children

    items([items()[1] as Row, items()[0] as Row])

    expect(containerOf(memory).children).toEqual([second, first])
  })

  it('disposes a row when its item leaves the collection', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const items = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
    ])
    const disposed: string[] = []

    mount(memory.rootElement, () => (
      <For each={items}>
        {(row: Row) => {
          onCleanup(() => disposed.push(row.id))
          return <text>{row.label}</text>
        }}
      </For>
    ))

    items([items()[0] as Row])

    expect(disposed).toEqual(['b'])
    expect(rows(containerOf(memory))).toEqual(['alpha'])
  })

  it('disposes every row when the mounted tree goes away', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const items = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
    ])
    const disposed: string[] = []

    const dispose = mount(memory.rootElement, () => (
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
})

/**
 * The container is how an accessible collection is expressed. The default flow
 * wrapper is presentational on purpose, so a role needs a real element to land
 * on — a constraint rather than an inconvenience, and the same reason the DOM
 * host never builds a `<ul>`.
 */
describe('For container semantics', () => {
  it('puts a role on the `as` container', () => {
    const { host, root, rootElement } = createMemoryHost()
    setHost(host)

    mount(rootElement, () => (
      <For each={['a', 'b']} as="view" role="list" label="tags">
        {(tag) => <text role="listitem">{tag}</text>}
      </For>
    ))

    expect(serializeMemoryTree(root.children[0] as MemoryElement)).toBe(
      [
        '<view label="tags" role="list">',
        '  <text role="listitem">',
        '    "a"',
        '  <text role="listitem">',
        '    "b"',
      ].join('\n'),
    )
  })

  it('marks the default wrapper as presentational', () => {
    const { host, root, rootElement } = createMemoryHost()
    setHost(host)

    mount(rootElement, () => <For each={['a']}>{(tag) => <text>{tag}</text>}</For>)

    // Nobody wrote this element. Both real hosts say so in their own spelling,
    // and the memory host carries the marker too so one parity assertion can
    // cover all three.
    expect((root.children[0] as MemoryElement | undefined)?.props['role']).toBe('presentation')
  })

  it('reports a role that has no container to land on', () => {
    const { host, rootElement } = createMemoryHost()
    setHost(host)
    const warnings: string[] = []
    const original = globalThis.console
    globalThis.console = { ...original, warn: (message: unknown) => warnings.push(String(message)) }

    try {
      mount(rootElement, () => (
        <For each={['a']} role="list">
          {(tag) => <text>{tag}</text>}
        </For>
      ))
    } finally {
      globalThis.console = original
    }

    // Dropping it silently would leave a list reading as a plain group to a
    // screen reader while looking right in the source — the exact failure this
    // layer exists to remove.
    expect(warnings[0]).toContain('`role` on a collection needs an `as` container')
  })
})
