import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearEngine, setEngine } from './engine/current-engine'
import type { LynxElement } from './engine/element-api'
import { list } from './list'
import { onCleanup } from './on-cleanup'
import { signal } from './signals'
import { createFakeEngine, type FakeElement, type FakeEngine } from './testing/create-fake-engine'
import { createElement } from './tree'

/**
 * The only reconciler in the package, so this suite is the only thing standing
 * between a reordered list and a screen full of rebuilt rows.
 *
 * Half of it asserts that the list CONVERGES on the right order, and half
 * asserts what that cost. The second half is the interesting one on a native
 * target: every insert and removal is a call across to the engine, so a
 * reconciler that reshuffles rows it did not need to touch is paying real money
 * for it. Asserting only on the resulting order would prove convergence and say
 * nothing about the clock.
 */

type Row = { id: string; label: string }

const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

/** The in-memory node behind an opaque handle. */
const fake = (element: LynxElement): FakeElement => element as unknown as FakeElement

/**
 * Installs a fresh engine, renders a keyed list into a container, and hands back
 * everything a case needs to inspect it.
 */
const renderList = (
  rows: () => readonly Row[],
  create: (row: Row) => LynxElement = (row) => <text>{row.label}</text>,
): { engine: FakeEngine; container: LynxElement } => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  const container = createElement('view')
  engine.api.__AppendElement(engine.pageElement, container)
  list(container, rows, (row) => row.id, create)
  return { engine, container }
}

/** The label each rendered row is showing, in tree order. */
const labels = (container: LynxElement): string[] =>
  fake(container).children.map((row) => String(row.children[0]?.attrs['text'] ?? ''))

/** The tree surgery one reconciliation pass performed, counted in engine calls. */
type Work = {
  /** Places, which is what a device pays for. */
  inserts: number
  /** Detaches. A MOVE shows up as one of these plus one insert, since `tree.insert` detaches first. */
  removals: number
  /**
   * How `tree.clear` and a row-by-row teardown are told apart: clearing reads
   * the child list once, where removing rows one at a time reads a parent per
   * row. Neither read is in the call log — they mutate nothing, and a log full
   * of them would drown the calls a test cares about.
   */
  childListReads: number
  parentReads: number
}

/**
 * Installs a fresh engine that also tallies the reads the call log does not
 * carry, and hands back a reader for the work done since the last reset.
 */
const countingEngine = (): { engine: FakeEngine; reset: () => void; work: () => Work } => {
  const engine = createFakeEngine()
  let childListReads = 0
  let parentReads = 0
  setEngine({
    ...engine.api,
    __GetChildren: (element) => {
      childListReads++
      return engine.api.__GetChildren(element)
    },
    __GetParent: (element) => {
      parentReads++
      return engine.api.__GetParent(element)
    },
  })

  return {
    engine,
    reset: () => {
      engine.clearCalls()
      childListReads = 0
      parentReads = 0
    },
    work: () => ({
      inserts: engine
        .calls()
        .filter((line) => line.startsWith('__AppendElement') || line.startsWith('__InsertElementBefore')).length,
      removals: engine.calls().filter((line) => line.startsWith('__RemoveElement')).length,
      childListReads,
      parentReads,
    }),
  }
}

/**
 * The console, reached through `globalThis` rather than as an ambient global.
 *
 * This package type-checks without any platform library — that absence is what
 * proves the runtime carries no browser dependency — and `console` is a host
 * global rather than part of ECMAScript, so it has to be named explicitly here
 * just as `warn.ts` does in the source.
 */
const consoleLike = (globalThis as unknown as { console: { warn: (...data: readonly unknown[]) => void } }).console

afterEach(async () => {
  await tick()
  clearEngine()
})

describe('list', () => {
  it('renders a row per item in order', () => {
    const rows = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
    ])

    const { container } = renderList(rows)

    expect(labels(container)).toEqual(['alpha', 'beta'])
  })

  it('appends without rebuilding the rows already present', () => {
    const rows = signal<Row[]>([{ id: 'a', label: 'alpha' }])
    const { container } = renderList(rows)
    const first = fake(container).children[0]

    rows([...rows(), { id: 'b', label: 'beta' }])

    expect(labels(container)).toEqual(['alpha', 'beta'])
    // Identity, not just content: an append must leave the existing node
    // untouched, which is the whole point of keying.
    expect(fake(container).children[0]).toBe(first)
  })

  it('reuses nodes across a reorder rather than rebuilding them', () => {
    const rows = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
      { id: 'c', label: 'gamma' },
    ])
    const { container } = renderList(rows)
    const [a, b, c] = fake(container).children

    rows([rows()[2] as Row, rows()[0] as Row, rows()[1] as Row])

    expect(labels(container)).toEqual(['gamma', 'alpha', 'beta'])
    expect(fake(container).children).toEqual([c, a, b])
  })

  it('disposes a removed row so its bindings stop reacting', () => {
    const removed: string[] = []
    const rows = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
    ])
    const { container } = renderList(rows, (row) => {
      onCleanup(() => removed.push(row.id))
      return (<text>{row.label}</text>) as LynxElement
    })

    rows([rows()[0] as Row])

    expect(labels(container)).toEqual(['alpha'])
    expect(removed).toEqual(['b'])
  })

  it('rebuilds a row when its key changes even though its position did not', () => {
    const rows = signal<Row[]>([{ id: 'a', label: 'alpha' }])
    const { container } = renderList(rows)
    const first = fake(container).children[0]

    rows([{ id: 'replaced', label: 'alpha' }])

    // Same slot and same label, but a new key means a new identity — otherwise a
    // row would silently keep state belonging to different data.
    expect(fake(container).children[0]).not.toBe(first)
  })

  it('keeps existing rows reactive after another row is appended', () => {
    // The regression this guards against is nasty precisely because it looks
    // fine: the rows stay on screen with the right text, but their bindings are
    // dead, so nothing they depend on ever updates them again. It happens when a
    // row's scope is owned by the reconciliation effect, since that effect
    // re-runs — and disposes everything it owns — on every collection change.
    const label = signal('before')
    const rows = signal<Row[]>([{ id: 'a', label: 'alpha' }])
    const { container } = renderList(rows, () => (<text>{() => label()}</text>) as LynxElement)

    rows([...rows(), { id: 'b', label: 'beta' }])
    label('after')

    expect(labels(container)[0]).toBe('after')
  })

  it('empties the container when the collection empties', () => {
    const rows = signal<Row[]>([{ id: 'a', label: 'alpha' }])
    const { container } = renderList(rows)

    rows([])

    expect(fake(container).children).toHaveLength(0)
  })

  it('moves nothing when an item is removed from the middle', () => {
    // The naive cursor reconciler this replaced re-inserted every row after the
    // gap, because its cursor desynchronised and never recovered. That is a call
    // across to the engine per row for an edit that should be free, and it is
    // one of the most common things a user does to a list.
    const { reset, work } = countingEngine()
    const container = createElement('view')
    const rows = signal('abcdefghij'.split('').map((id) => ({ id, label: id })))
    list(
      container,
      rows,
      (row) => row.id,
      (row) => (<text>{row.label}</text>) as LynxElement,
    )

    reset()
    rows(rows().filter((row) => row.id !== 'e'))

    expect(work().inserts).toBe(0)
    expect(work().removals).toBe(1)
    expect(labels(container).join('')).toBe('abcdfghij')
  })

  it('moves one node when a row travels the length of the list', () => {
    const { reset, work } = countingEngine()
    const container = createElement('view')
    const rows = signal('abcdefghij'.split('').map((id) => ({ id, label: id })))
    list(
      container,
      rows,
      (row) => row.id,
      (row) => (<text>{row.label}</text>) as LynxElement,
    )

    reset()
    const next = [...rows()]
    const head = next.shift() as Row
    rows([...next, head])

    // The two-ended walk catches this on its cross case: one move, not nine. A
    // move is a detach plus a place, so one of each.
    expect(work().inserts).toBe(1)
    expect(work().removals).toBe(1)
    expect(labels(container).join('')).toBe('bcdefghija')
  })

  it('swaps a pair with one move', () => {
    const { reset, work } = countingEngine()
    const container = createElement('view')
    const rows = signal('abcd'.split('').map((id) => ({ id, label: id })))
    list(
      container,
      rows,
      (row) => row.id,
      (row) => (<text>{row.label}</text>) as LynxElement,
    )

    reset()
    rows([rows()[0] as Row, rows()[2] as Row, rows()[1] as Row, rows()[3] as Row])

    expect(labels(container).join('')).toBe('acbd')
    expect(work().inserts).toBe(1)
  })

  it('empties through a single clear rather than row by row', () => {
    // Told apart by which read the runtime made: `tree.clear` reads the child
    // list once, where a row-by-row teardown reads a parent per row. Fifty
    // parent reads for an edit that should cost one traversal is exactly the
    // shape of waste this guards against.
    const { reset, work } = countingEngine()
    const container = createElement('view')
    const rows = signal(Array.from({ length: 50 }, (_, i) => ({ id: String(i), label: String(i) })))
    list(
      container,
      rows,
      (row) => row.id,
      (row) => (<text>{row.label}</text>) as LynxElement,
    )

    reset()
    rows([])

    expect(work().childListReads).toBe(1)
    expect(work().parentReads).toBe(0)
    expect(fake(container).children).toHaveLength(0)
  })

  it('warns and drops a row rather than silently collapsing a duplicate key', () => {
    // Two items claiming one identity used to render as one row with no
    // complaint, which reads exactly like data going missing. `indexKey` is the
    // supported way to render a collection of primitives that can repeat.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const warn = vi.spyOn(consoleLike, 'warn').mockImplementation(() => {})
    const container = createElement('view')

    list(
      container,
      () => ['red', 'red', 'blue'],
      (tag) => tag,
      (tag) => (<text>{tag}</text>) as LynxElement,
    )

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('duplicate key'), 'red')
    expect(labels(container)).toEqual(['red', 'blue'])
    warn.mockRestore()
  })

  it('stops tracking once disposed', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const container = createElement('view')
    const rows = signal<Row[]>([{ id: 'a', label: 'alpha' }])
    const dispose = list(
      container,
      rows,
      (row) => row.id,
      (row) => (<text>{row.label}</text>) as LynxElement,
    )

    dispose()
    rows([...rows(), { id: 'b', label: 'beta' }])

    expect(fake(container).children).toHaveLength(1)
  })

  it('disposing twice is harmless', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const container = createElement('view')
    const dispose = list(
      container,
      () => [{ id: 'a', label: 'alpha' }],
      (row) => row.id,
      (row) => (<text>{row.label}</text>) as LynxElement,
    )

    dispose()

    expect(() => dispose()).not.toThrow()
  })

  it('gives the create callback the row index', () => {
    const rows = signal<Row[]>([
      { id: 'a', label: 'alpha' },
      { id: 'b', label: 'beta' },
    ])
    const seen: number[] = []
    renderList(rows, (row) => {
      // The index is a build-time value, not a binding — a row that moves keeps
      // the index it was created with, because nothing re-runs a component.
      seen.push(rows().indexOf(row))
      return (<text>{row.label}</text>) as LynxElement
    })

    expect(seen).toEqual([0, 1])
  })
})
