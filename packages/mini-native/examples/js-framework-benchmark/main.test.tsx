/** @jsxImportSource ../../src */
import { afterEach, describe, expect, it } from 'vitest'

import { clearHost, setHost } from '../../src/current-host'
import { createMemoryHost, type MemoryElement } from '../../src/hosts/create-memory-host'
import { dispatchMemoryEvent } from '../../src/hosts/dispatch-memory-event'
import { mount } from '../../src/mount'
import { createBenchmarkApp } from './main'

afterEach(() => {
  clearHost()
})

/** Mounts the app and hands back the pieces a test needs to poke at it. */
const setup = () => {
  const memory = createMemoryHost()
  setHost(memory.host)
  const app = createBenchmarkApp()
  mount(memory.rootElement, () => app.element)
  const root = memory.root.children[0] as MemoryElement
  return { memory, store: app.store, body: root.children[1] as MemoryElement }
}

/** The label each rendered row is showing, in tree order. */
const labels = (body: MemoryElement): string[] =>
  body.children.map((row) => {
    const label = (row as MemoryElement).children[1] as MemoryElement
    return String((label.children[0] as { value: string }).value)
  })

describe('js-framework-benchmark', () => {
  it('creates a thousand rows into the list container', () => {
    const { store, body } = setup()

    store.run()

    expect(body.children).toHaveLength(1000)
    // A real element rather than the flow wrapper, so the collection's role has
    // somewhere honest to land.
    expect(body.props['role']).toBe('list')
  })

  it('rewrites every tenth label without reconciling the list', () => {
    const { store, body } = setup()
    store.run()
    const before = [...body.children]

    store.update()

    // The array reference is unchanged, so `list` does not re-run at all — the
    // rows are the same nodes and only the touched text bindings fired.
    expect(body.children).toEqual(before)
    expect(labels(body)[0]?.endsWith(' !!!')).toBe(true)
    expect(labels(body)[1]?.endsWith(' !!!')).toBe(false)
  })

  it('swaps two rows by moving nodes rather than rebuilding them', () => {
    const { store, body } = setup()
    store.run()
    const before = [...body.children]

    store.swapRows()

    // The guarantee the two-ended diff exists for. Same nodes, two of them in
    // each other's places, nothing else touched.
    expect(body.children[1]).toBe(before[998])
    expect(body.children[998]).toBe(before[1])
    expect(body.children[0]).toBe(before[0])
  })

  it('selects a row by tapping it, and only marks that one', () => {
    const { store, body } = setup()
    store.run()

    dispatchMemoryEvent(body.children[3] as MemoryElement, 'tap')

    expect(store.selectedId()).toBe(store.rows()[3]?.id)
    expect((body.children[3] as MemoryElement).props['class']).toBe('row danger')
    expect((body.children[4] as MemoryElement).props['class']).toBe('row')
  })

  it('moves the selection without leaving the old row marked', () => {
    const { store, body } = setup()
    store.run()

    store.select(store.rows()[3]?.id ?? 0)
    store.select(store.rows()[7]?.id ?? 0)

    expect((body.children[3] as MemoryElement).props['class']).toBe('row')
    expect((body.children[7] as MemoryElement).props['class']).toBe('row danger')
  })

  it('removes a row by tapping its remove control', () => {
    const { store, body } = setup()
    store.run()
    const removedId = store.rows()[3]?.id

    const remove = (body.children[3] as MemoryElement).children[2] as MemoryElement
    dispatchMemoryEvent(remove, 'tap')

    expect(body.children).toHaveLength(999)
    expect(store.rows().some((row) => row.id === removedId)).toBe(false)
  })

  it('clears the selection when the selected row is removed', () => {
    const { store } = setup()
    store.run()
    const id = store.rows()[3]?.id ?? 0

    store.select(id)
    store.remove(id)

    // Otherwise the store keeps pointing at a row that no longer exists, and the
    // next select would try to unmark a node that has been disposed.
    expect(store.selectedId()).toBeNull()
  })

  it('appends without disturbing the rows already there', () => {
    const { store, body } = setup()
    store.run()
    const before = [...body.children]

    store.add()

    expect(body.children).toHaveLength(2000)
    expect(body.children.slice(0, 1000)).toEqual(before)
  })

  it('clears the list and the selection together', () => {
    const { store, body } = setup()
    store.run()
    store.select(store.rows()[0]?.id ?? 0)

    store.clear()

    expect(body.children).toEqual([])
    expect(store.selectedId()).toBeNull()
  })
})
