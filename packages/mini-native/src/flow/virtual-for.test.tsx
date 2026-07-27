import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { dispatchMemoryEvent } from '../hosts/dispatch-memory-event'
import { clearHost, mount, setHost, signal } from '../index'
import { VirtualFor } from './virtual-for'

afterEach(() => {
  clearHost()
})

type Row = { id: number; label: string }

const rowsOfLength = (length: number): Row[] =>
  Array.from({ length }, (_, index) => ({ id: index, label: `row ${index}` }))

/** The scrolling viewport this component builds, which is the element it returns. */
const viewportOf = (root: MemoryElement): MemoryElement => root.children[0] as MemoryElement

/** The runway inside it, whose children are the live slots. */
const runwayOf = (root: MemoryElement): MemoryElement => viewportOf(root).children[0] as MemoryElement

/** The label each slot is currently showing, in tree order. */
const shown = (root: MemoryElement): string[] =>
  runwayOf(root).children.map((slot) => {
    const text = (slot as MemoryElement).children[0] as MemoryElement
    return String((text.children[0] as { value: string }).value)
  })

/** The offset each slot is positioned at along the scrolling axis. */
const positions = (root: MemoryElement): unknown[] =>
  runwayOf(root).children.map((slot) => (slot as MemoryElement).style?.['top'])

/** Scrolls the viewport, as a user's finger would. */
const scrollTo = (root: MemoryElement, y: number): void => {
  dispatchMemoryEvent(viewportOf(root), 'scroll', { y })
}

describe('virtual-for', () => {
  it('builds a bounded window rather than a node per row', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <VirtualFor each={rowsOfLength(10_000)} itemSize={50} viewport={500} overscan={2}>
        {(row) => <text>{() => row().label}</text>}
      </VirtualFor>
    ))

    // The entire premise: ten thousand rows, and the number of host elements is
    // a function of the screen rather than of the collection. Ten fit, plus two
    // overscan at each edge.
    expect(runwayOf(memory.root).children).toHaveLength(14)
    expect(shown(memory.root)[0]).toBe('row 0')
  })

  it('gives the runway the extent the whole collection would occupy', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <VirtualFor each={rowsOfLength(1000)} itemSize={50} viewport={500}>
        {(row) => <text>{() => row().label}</text>}
      </VirtualFor>
    ))

    // Without this the scrollbar and the fling physics would describe a
    // screenful rather than the real list, which is the giveaway that a list is
    // virtualised badly.
    expect(runwayOf(memory.root).style?.['height']).toBe(50_000)
  })

  it('moves data through the slots on scroll without rebuilding them', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <VirtualFor each={rowsOfLength(1000)} itemSize={50} viewport={200} overscan={0}>
        {(row) => <text>{() => row().label}</text>}
      </VirtualFor>
    ))
    const before = [...runwayOf(memory.root).children]

    scrollTo(memory.root, 500)

    // The whole reason this is affordable: scrolling is a signal write into
    // nodes that already exist, not a teardown and rebuild. Same nodes, by
    // identity — different data.
    expect(runwayOf(memory.root).children).toEqual(before)
    expect(shown(memory.root)).toEqual(['row 10', 'row 11', 'row 12', 'row 13'])
  })

  it('repositions the slots as their data index changes', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <VirtualFor each={rowsOfLength(1000)} itemSize={50} viewport={100} overscan={0}>
        {(row) => <text>{() => row().label}</text>}
      </VirtualFor>
    ))

    expect(positions(memory.root)).toEqual([0, 50])
    scrollTo(memory.root, 300)

    // A recycled node has to be moved to where its new row belongs, or the list
    // scrolls its data without scrolling its layout.
    expect(positions(memory.root)).toEqual([300, 350])
  })

  it('keeps extra rows built beyond each edge', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <VirtualFor each={rowsOfLength(1000)} itemSize={50} viewport={100} overscan={2}>
        {(row) => <text>{() => row().label}</text>}
      </VirtualFor>
    ))
    scrollTo(memory.root, 500)

    // Two rows of runway ahead of the leading edge is what stops a fast flick
    // showing blank space while the next row is built.
    expect(shown(memory.root)[0]).toBe('row 8')
    expect(shown(memory.root)).toHaveLength(6)
  })

  it('stops the window running past the end of the collection', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <VirtualFor each={rowsOfLength(20)} itemSize={50} viewport={200} overscan={0}>
        {(row) => <text>{() => row().label}</text>}
      </VirtualFor>
    ))
    scrollTo(memory.root, 100_000)

    // Scrolled far past the end, the window pins to the last screenful rather
    // than rendering fewer and fewer rows the further it goes.
    expect(shown(memory.root)).toEqual(['row 16', 'row 17', 'row 18', 'row 19'])
  })

  it('renders nothing at all for an empty collection', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <VirtualFor each={[] as Row[]} itemSize={50} viewport={200}>
        {(row) => <text>{() => row().label}</text>}
      </VirtualFor>
    ))

    // The case where the clamped index would otherwise read past the end: no
    // slot exists, so the getter never runs.
    expect(runwayOf(memory.root).children).toEqual([])
    expect(runwayOf(memory.root).style?.['height']).toBe(0)
  })

  it('follows the collection when it changes underneath', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const rows = signal(rowsOfLength(100))

    mount(memory.rootElement, () => (
      <VirtualFor each={rows} itemSize={50} viewport={100} overscan={0}>
        {(row) => <text>{() => row().label}</text>}
      </VirtualFor>
    ))
    rows([{ id: 0, label: 'only' }])

    expect(shown(memory.root)).toEqual(['only'])
    expect(runwayOf(memory.root).style?.['height']).toBe(50)
  })

  it('grows the window when the viewport does', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const height = signal(100)

    mount(memory.rootElement, () => (
      <VirtualFor each={rowsOfLength(1000)} itemSize={50} viewport={height} overscan={0}>
        {(row) => <text>{() => row().label}</text>}
      </VirtualFor>
    ))
    expect(runwayOf(memory.root).children).toHaveLength(2)

    height(400)

    // A rotation or a split-screen resize, which would otherwise leave the
    // bottom of the screen empty until the user scrolled.
    expect(runwayOf(memory.root).children).toHaveLength(8)
  })

  it('scrolls sideways when asked to', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <VirtualFor each={rowsOfLength(100)} itemSize={80} viewport={240} axis="horizontal" overscan={0}>
        {(row) => <text>{() => row().label}</text>}
      </VirtualFor>
    ))
    dispatchMemoryEvent(viewportOf(memory.root), 'scroll', { x: 160 })

    expect(viewportOf(memory.root).props['axis']).toBe('horizontal')
    expect(runwayOf(memory.root).style?.['width']).toBe(8000)
    expect(shown(memory.root)).toEqual(['row 2', 'row 3', 'row 4'])
    expect(runwayOf(memory.root).children.map((slot) => (slot as MemoryElement).style?.['left'])).toEqual([
      160, 240, 320,
    ])
  })

  it('carries the collection role onto a real element', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <VirtualFor each={rowsOfLength(4)} itemSize={50} viewport={200} role="list" label="tags">
        {(row) => <text role="listitem">{() => row().label}</text>}
      </VirtualFor>
    ))

    // Unlike the default flow wrapper, the viewport is a real element the author
    // asked for, so a role has somewhere honest to land.
    expect(viewportOf(memory.root).props['role']).toBe('list')
    expect(viewportOf(memory.root).props['label']).toBe('tags')
  })

  it('merges the caller style with the extent it has to set itself', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <VirtualFor each={rowsOfLength(4)} itemSize={50} viewport={200} style={{ background: '#fff' }}>
        {(row) => <text>{() => row().label}</text>}
      </VirtualFor>
    ))

    expect(viewportOf(memory.root).style).toEqual({ background: '#fff', height: 200 })
  })

  it('warns rather than rendering the whole collection when itemSize is zero', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      mount(memory.rootElement, () => (
        <VirtualFor each={rowsOfLength(10_000)} itemSize={0} viewport={200}>
          {(row) => <text>{() => row().label}</text>}
        </VirtualFor>
      ))

      // Dividing by it would make every derived count `Infinity` and build the
      // entire collection — the exact opposite of what was asked for, and
      // silently, which is the worst way for this to fail.
      expect(warn).toHaveBeenCalled()
      expect(runwayOf(memory.root).children.length).toBeLessThan(1000)
    } finally {
      warn.mockRestore()
    }
  })
})
