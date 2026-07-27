/** @jsxImportSource ../../src */
import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from '../../src/engine/current-engine'
import { clearWorklets } from '../../src/events/worklet-registry'
import { mount } from '../../src/mount'
import { createFakeEngine, type FakeElement } from '../../src/testing/create-fake-engine'
import { type BenchmarkStore, createBenchmarkApp } from './main'

/**
 * The benchmark is an example rather than shipped code, so this suite is not
 * about correctness of a feature — it is about the workload staying the WORKLOAD.
 * Each case pins one of the measured operations to the behaviour the number is
 * supposed to describe, so a change that quietly made *swap rows* rebuild its
 * rows would show up as a failing test rather than as a slower run nobody
 * noticed.
 */

const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

/** Mounts the app and hands back the pieces a case needs to poke at it. */
const setup = (): { engine: ReturnType<typeof createFakeEngine>; store: BenchmarkStore; body: FakeElement } => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  const app = createBenchmarkApp()
  mount(engine.pageElement, () => app.element)
  const body = engine.findByTestId('rows')
  if (!body) throw new Error('the row container did not render')
  return { engine, store: app.store, body }
}

/** The label each rendered row is showing, in tree order. */
const labels = (body: FakeElement): string[] =>
  body.children.map((row) => String(row.children[1]?.children[0]?.attrs['text'] ?? ''))

afterEach(async () => {
  await tick()
  clearEngine()
  clearWorklets()
})

describe('js-framework-benchmark', () => {
  it('creates a thousand rows into the list container', () => {
    const { store, body } = setup()

    store.run()

    expect(body.children).toHaveLength(1000)
    // A real `scroll-view`, not a wrapper: the rows have to scroll, and a
    // wrapper takes no part in layout at all.
    expect(body.tag).toBe('scroll-view')
  })

  it('builds every row out of Lynx tags with text runs as real elements', () => {
    // The row shape is the thing being timed, so it is worth pinning: a `<text>`
    // holding a `raw-text` is what a run of text IS on this target, and a
    // benchmark that quietly stopped building one would be measuring a tree no
    // device could render.
    const { store, body } = setup()
    store.run()
    const row = body.children[0] as FakeElement

    expect(row.tag).toBe('view')
    expect(row.children.map((child) => child.tag)).toEqual(['text', 'text', 'view'])
    expect(row.children[0]?.children[0]?.tag).toBe('raw-text')
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

  it('touches one text run per updated row and nothing else', () => {
    // What "partial update" is supposed to cost. A hundred rows updated out of a
    // thousand should be a hundred attribute writes, with no tree surgery at all.
    const { engine, store, body } = setup()
    store.run()
    engine.clearCalls()

    store.update()

    const calls = engine.calls()
    expect(calls.filter((line) => line.startsWith('__SetAttribute'))).toHaveLength(100)
    expect(calls.some((line) => line.startsWith('__AppendElement'))).toBe(false)
    expect(calls.some((line) => line.startsWith('__RemoveElement'))).toBe(false)
    expect(body.children).toHaveLength(1000)
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
    const { engine, store, body } = setup()
    store.run()

    engine.dispatch(body.children[3] as FakeElement, 'tap')

    expect(store.selectedId()).toBe(store.rows()[3]?.id)
    expect((body.children[3] as FakeElement).classes).toBe('row danger')
    expect((body.children[4] as FakeElement).classes).toBe('row')
  })

  it('selects in a constant number of writes whatever the list length', () => {
    // The O(1) select. A shared `selectedId` signal read by every row's class
    // would make this a thousand effects re-running to change one class.
    const { engine, store } = setup()
    store.run()
    engine.clearCalls()

    store.select(store.rows()[3]?.id ?? 0)

    expect(engine.calls().filter((line) => line.startsWith('__SetClasses'))).toHaveLength(1)
  })

  it('moves the selection without leaving the old row marked', () => {
    const { store, body } = setup()
    store.run()

    store.select(store.rows()[3]?.id ?? 0)
    store.select(store.rows()[7]?.id ?? 0)

    expect((body.children[3] as FakeElement).classes).toBe('row')
    expect((body.children[7] as FakeElement).classes).toBe('row danger')
  })

  it('removes a row by tapping its remove control', () => {
    const { engine, store, body } = setup()
    store.run()
    const removedId = store.rows()[3]?.id

    engine.dispatch((body.children[3] as FakeElement).children[2] as FakeElement, 'tap')

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

  it('replaces every row when run is invoked twice', () => {
    const { store, body } = setup()
    store.run()
    const before = [...body.children]

    store.run()

    expect(body.children).toHaveLength(1000)
    expect(body.children[0]).not.toBe(before[0])
  })

  it('coalesces a whole create into a single commit', async () => {
    // A thousand rows is tens of thousands of mutations. Committing per mutation
    // would be tens of thousands of whole-tree commits, which is the difference
    // this scheduler exists to make.
    const { engine, store } = setup()
    await tick()
    const afterMount = engine.flushes()

    store.run()
    await tick()

    expect(engine.flushes()).toBe(afterMount + 1)
  })
})
