import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { mount } from '../mount'
import { setErrorHandler } from '../report-error'
import { signal } from '../signals'
import { createFakeEngine, type FakeElement, type FakeEngine } from '../testing/create-fake-engine'
import { serializeTree } from '../testing/serialize-tree'
import { recycle } from './recycle'

afterEach(clearEngine)

type Row = { id: string; label: string }

const rowsOf = (count: number, prefix = 'Row'): Row[] =>
  Array.from({ length: count }, (_, index) => ({ id: String(index), label: `${prefix} ${index}` }))

/** Mounts a recycling list over `rows` and hands back the list element. */
const setup = (rows: () => readonly Row[], attributes: Record<string, unknown> = {}) => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  let list!: LynxElement
  mount(engine.pageElement, () => {
    list = recycle(
      {
        each: rows,
        itemKey: (row) => row.id,
        cell: (item) => (
          <list-item item-key={item().id}>
            <text>
              <raw-text text={() => item().label} />
            </text>
          </list-item>
        ),
      },
      attributes,
    )
    return list
  })
  return { engine, list: engine.find('list') as FakeElement }
}

/** What the cell at a given engine id currently shows. */
const textOf = (engine: FakeEngine, sign: number): string => {
  const cell = engine.findAll('list-item').find((item) => item.id + 10 === sign)
  return cell ? serializeTree(cell).replace(/\s+/g, ' ') : ''
}

describe('recycle', () => {
  it('creates the list through __CreateList, not __CreateElement', () => {
    const { engine } = setup(() => rowsOf(3))

    // The whole reason this exists. `__CreateElement('list', …)` builds a
    // generic fiber node that is not a list and has no virtualisation at all —
    // it renders, which is what makes the mistake survive every test that is
    // not run on a device.
    expect(engine.calls().some((call) => call.startsWith('__CreateList('))).toBe(true)
    expect(engine.calls().some((call) => call.startsWith('__CreateElement("list"'))).toBe(false)
  })

  it('realises nothing until the engine asks', () => {
    const { engine } = setup(() => rowsOf(10_000))

    // The point of a recycler: ten thousand rows, zero elements. `For` over the
    // same data would have built ten thousand real views on the main thread.
    expect(engine.findAll('list-item')).toHaveLength(0)
  })

  it('publishes the inventory so the engine knows what to ask for', () => {
    const { list } = setup(() => rowsOf(3))

    const info = list.attrs['update-list-info'] as { insertAction: { position: number }[] }
    // An engine cannot request a row it has not been told about, so a recycler
    // that updated its data and stopped here would scroll a stale list forever.
    expect(info.insertAction.map((entry) => entry.position)).toEqual([0, 1, 2])
  })

  it('builds a cell on first request and returns its engine id', () => {
    const { engine, list } = setup(() => rowsOf(5))

    const sign = engine.enterListItemAtIndex(list, 2)

    expect(engine.findAll('list-item')).toHaveLength(1)
    expect(textOf(engine, sign)).toContain('"Row 2"')
  })

  it('reuses a parked cell rather than building a second one', () => {
    const { engine, list } = setup(() => rowsOf(100))

    const first = engine.enterListItemAtIndex(list, 0)
    engine.leaveListItem(list, first)
    const second = engine.enterListItemAtIndex(list, 1)

    // Same element, different row — which is the entire contract.
    expect(second).toBe(first)
    expect(engine.findAll('list-item')).toHaveLength(1)
    expect(textOf(engine, second)).toContain('"Row 1"')
  })

  it('fills a reused cell by writing a signal, not by rebuilding it', () => {
    const { engine, list } = setup(() => rowsOf(100))

    const sign = engine.enterListItemAtIndex(list, 0)
    engine.leaveListItem(list, sign)
    engine.clearCalls()
    engine.enterListItemAtIndex(list, 7)

    // No element is created on reuse. The bindings the cell built when it was
    // first made are still attached, so re-pointing it at row 7 mutates exactly
    // the text that differs — no diff, no hydration, no tree walk.
    expect(engine.calls().filter((call) => call.startsWith('__Create'))).toEqual([])
    expect(textOf(engine, sign)).toContain('"Row 7"')
  })

  it('keeps a bounded number of elements across a long scroll', () => {
    const { engine, list } = setup(() => rowsOf(10_000))

    // Two cells in flight at a time, walked the length of the collection.
    let held: number[] = []
    for (let index = 0; index < 500; index++) {
      held.push(engine.enterListItemAtIndex(list, index))
      if (held.length > 2) {
        engine.leaveListItem(list, held[0] as number)
        held = held.slice(1)
      }
    }

    // Three elements for five hundred rows. This is the assertion the whole
    // feature exists for.
    expect(engine.findAll('list-item')).toHaveLength(3)
  })

  it('commits each cell with the engine’s own correlation token', () => {
    const { engine, list } = setup(() => rowsOf(3))
    engine.clearCalls()

    const sign = engine.enterListItemAtIndex(list, 1)

    // The engine matches its request to this commit on `operationID`, and lays
    // the cell out as part of it. A commit without it leaves the cell measured
    // at zero height, on a device only — so the token has to be asserted rather
    // than the fact that something flushed.
    const commit = engine.calls().find((call) => call.includes('operationID'))
    expect(commit).toBeDefined()
    expect(commit).toContain('"triggerLayout":true')
    expect(commit).toContain(`"elementID":${sign}`)
    // Handed back untouched: the engine issued it, and correlates on it.
    expect(commit).toMatch(/"operationID":\d+/)
    expect(commit).toContain(`"listID":${list.id + 10}`)
  })

  it('pools separately by reuse identifier', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const rows: Row[] = [
      { id: 'h', label: 'Header' },
      { id: 'a', label: 'A' },
    ]
    let list!: LynxElement
    mount(engine.pageElement, () => {
      list = recycle({
        each: () => rows,
        itemKey: (row) => row.id,
        reuseIdentifier: (row) => (row.id === 'h' ? 'header' : 'row'),
        cell: (item) => <list-item item-key={item().id} />,
      })
      return list
    })
    const element = engine.find('list') as FakeElement

    const header = engine.enterListItemAtIndex(element, 0)
    engine.leaveListItem(element, header)
    const row = engine.enterListItemAtIndex(element, 1)

    // A header and a row are not structurally interchangeable, so handing one
    // the other's elements would be the recycler's classic visual bug.
    expect(row).not.toBe(header)
  })

  it('re-asserts platform info when a cell changes rows', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const rows = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]
    let list!: LynxElement
    mount(engine.pageElement, () => {
      list = recycle({
        each: () => rows,
        itemKey: (row) => row.id,
        rowInfo: (row) => ({ 'sticky-top': row.id === 'a' }),
        cell: (item) => <list-item item-key={item().id} />,
      })
      return list
    })
    const element = engine.find('list') as FakeElement

    const sign = engine.enterListItemAtIndex(element, 0)
    engine.leaveListItem(element, sign)
    engine.enterListItemAtIndex(element, 1)

    // Platform info belongs to the ROW, not to the cell, so a pooled cell
    // carries the previous row's stickiness unless it is written again.
    const cell = engine.findAll('list-item')[0] as FakeElement
    expect(cell.attrs['sticky-top']).toBe(false)
    expect(cell.attrs['item-key']).toBe('b')
  })

  it('describes an append as an insertion, leaving the existing rows alone', () => {
    const rows = signal(rowsOf(2))
    const { list } = setup(rows)

    rows([...rows(), { id: '2', label: 'Row 2' }])

    const info = list.attrs['update-list-info'] as {
      insertAction: { position: number }[]
      removeAction: number[]
    }
    expect(info.insertAction.map((entry) => entry.position)).toEqual([2])
    expect(info.removeAction).toEqual([])
  })

  it('describes a removal by the index the row used to hold', () => {
    const rows = signal(rowsOf(3))
    const { list } = setup(rows)

    rows(rows().filter((row) => row.id !== '1'))

    const info = list.attrs['update-list-info'] as {
      insertAction: unknown[]
      removeAction: number[]
      updateAction: { from: number; to: number }[]
    }
    expect(info.removeAction).toEqual([1])
    expect(info.insertAction).toEqual([])
    // Row 2 slid down into the gap, which the engine is told about so it can
    // re-query rather than keep showing it where it was.
    expect(info.updateAction.map((entry) => [entry.from, entry.to])).toEqual([[2, 1]])
  })

  it('serves the new data after the collection changes under a live cell', () => {
    const rows = signal(rowsOf(3))
    const { engine, list } = setup(rows)

    const sign = engine.enterListItemAtIndex(list, 0)
    engine.leaveListItem(list, sign)
    rows(rowsOf(3, 'Updated'))
    engine.enterListItemAtIndex(list, 0)

    expect(textOf(engine, sign)).toContain('"Updated 0"')
  })

  it('answers -1 rather than a wrong row when asked past the end', () => {
    const { engine, list } = setup(() => rowsOf(2))

    // The engine's inventory can lag the data by a commit. Returning a real
    // cell would show the wrong row; -1 is the engine's own "nothing here".
    expect(engine.enterListItemAtIndex(list, 9)).toBe(-1)
  })

  it('applies list attributes through the ordinary prop path', () => {
    const { list } = setup(() => rowsOf(1), { 'list-type': 'waterfall', 'span-count': 2 })

    // Spelled the engine's way, because they ARE the engine's — there is no
    // translation table in this package.
    expect(list.attrs['list-type']).toBe('waterfall')
    expect(list.attrs['span-count']).toBe(2)
  })

  it('installs inert callbacks on teardown instead of leaving them live', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    let list!: LynxElement
    const dispose = mount(engine.pageElement, () => {
      list = recycle({
        each: () => rowsOf(3),
        itemKey: (row) => row.id,
        cell: (item) => <list-item item-key={item().id} />,
      })
      return list
    })
    const element = engine.find('list') as FakeElement

    dispose()

    // The engine may be mid-scroll when a list is removed. Answering "nothing
    // here" is safe; reaching into a torn-down pool is not.
    expect(engine.enterListItemAtIndex(element, 0)).toBe(-1)
  })

  it('answers "nothing here" when building a cell throws, instead of unwinding into the engine', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const reported: string[] = []
    setErrorHandler((_error, source) => reported.push(source))
    let list!: LynxElement
    mount(engine.pageElement, () => {
      list = recycle({
        each: () => rowsOf(3),
        itemKey: (row) => row.id,
        cell: () => {
          throw new Error('the cell threw')
        },
      })
      return list
    })
    const element = engine.find('list') as FakeElement

    // `componentAtIndex` is called BY the engine, mid-scroll. A throw leaving it
    // unwinds into native list layout; -1 is a row that does not appear.
    expect(engine.enterListItemAtIndex(element, 0)).toBe(-1)
    expect(reported).toEqual(['render'])
    setErrorHandler(null)
  })

  it('keeps a failing fill from draining the pool', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    setErrorHandler(() => {})
    let explode = false
    let list!: LynxElement
    mount(engine.pageElement, () => {
      list = recycle({
        each: () => rowsOf(3),
        itemKey: (row) => row.id,
        cell: (item) => (
          <list-item item-key={item().id}>
            <text>
              <raw-text
                text={() => {
                  if (explode) throw new Error('a binding threw')
                  return item().label
                }}
              />
            </text>
          </list-item>
        ),
      })
      return list
    })
    const element = engine.find('list') as FakeElement

    const sign = engine.enterListItemAtIndex(element, 0)
    engine.leaveListItem(element, sign)
    const before = engine.findAll('list-item').length

    explode = true
    expect(engine.enterListItemAtIndex(element, 1)).toBe(-1)
    explode = false

    // The failed fill had already taken the cell out of the pool, and the engine
    // will never hand back a cell it was told does not exist — so without the
    // re-park a failure repeating every frame allocates a fresh element per row.
    expect(engine.enterListItemAtIndex(element, 1)).toBe(sign)
    expect(engine.findAll('list-item')).toHaveLength(before)
    setErrorHandler(null)
  })
})
