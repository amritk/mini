import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { dispatchMemoryEvent } from '../hosts/dispatch-memory-event'
import { clearHost, setHost } from '../index'
import type { HostElement } from '../types'
import { type PanEvent, pan } from './pan'

afterEach(() => {
  clearHost()
})

/** Installs a host and hands back an element plus a way to drive its pointer stream. */
const setup = (): {
  element: HostElement
  pointer: (phase: string, at: { x: number; y: number }, id?: number) => void
} => {
  const memory = createMemoryHost()
  setHost(memory.host)
  const element = memory.host.createElement('view')
  return {
    element,
    pointer: (phase, at, id = 1) =>
      dispatchMemoryEvent(element as unknown as MemoryElement, 'pointer', { id, phase, ...at }),
  }
}

describe('pan', () => {
  it('reports the distance from where the finger went down', () => {
    const { element, pointer } = setup()
    const moves: PanEvent[] = []
    pan(element, { onMove: (event) => moves.push(event) })

    pointer('down', { x: 10, y: 10 })
    pointer('move', { x: 40, y: 30 })

    expect(moves[0]).toMatchObject({ x: 40, y: 30, dx: 30, dy: 20 })
  })

  it('measures from the start rather than from the last move', () => {
    const { element, pointer } = setup()
    const moves: PanEvent[] = []
    pan(element, { onMove: (event) => moves.push(event) })

    pointer('down', { x: 0, y: 0 })
    pointer('move', { x: 10, y: 0 })
    pointer('move', { x: 25, y: 0 })

    // A drag reports total displacement, not per-frame deltas — otherwise every
    // caller has to accumulate them, and every caller would get it slightly
    // differently wrong.
    expect(moves.map((event) => event.dx)).toEqual([10, 25])
  })

  it('ignores a second finger arriving mid-drag', () => {
    const { element, pointer } = setup()
    const moves: PanEvent[] = []
    pan(element, { onMove: (event) => moves.push(event) })

    pointer('down', { x: 0, y: 0 }, 1)
    pointer('down', { x: 100, y: 100 }, 2)
    pointer('move', { x: 200, y: 200 }, 2)
    pointer('move', { x: 5, y: 0 }, 1)

    // Two fingers are a different gesture. A pan that quietly became the
    // average of two is worse than one that stayed a pan.
    expect(moves).toHaveLength(1)
    expect(moves[0]).toMatchObject({ dx: 5 })
  })

  it('says when the target took the gesture away', () => {
    const { element, pointer } = setup()
    const ends: PanEvent[] = []
    pan(element, { onEnd: (event) => ends.push(event) })

    pointer('down', { x: 0, y: 0 })
    pointer('cancel', { x: 50, y: 0 })

    // A cancel is a scroll container claiming the drag or a call arriving, not
    // the user completing anything — and a recogniser that cannot tell will
    // commit gestures nobody made.
    expect(ends[0]?.cancelled).toBe(true)
  })

  it('starts cleanly after a gesture ends', () => {
    const { element, pointer } = setup()
    const moves: PanEvent[] = []
    pan(element, { onMove: (event) => moves.push(event) })

    pointer('down', { x: 0, y: 0 })
    pointer('up', { x: 100, y: 0 })
    pointer('down', { x: 50, y: 0 })
    pointer('move', { x: 60, y: 0 })

    expect(moves[0]).toMatchObject({ dx: 10 })
  })

  it('detaches when disposed', () => {
    const { element, pointer } = setup()
    const moves: PanEvent[] = []
    const dispose = pan(element, { onMove: (event) => moves.push(event) })

    dispose()
    pointer('down', { x: 0, y: 0 })
    pointer('move', { x: 40, y: 0 })

    expect(moves).toEqual([])
  })
})
