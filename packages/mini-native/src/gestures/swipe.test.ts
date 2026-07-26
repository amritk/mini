import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { dispatchMemoryEvent } from '../hosts/dispatch-memory-event'
import { clearHost, setHost } from '../index'
import type { HostElement } from '../types'
import { type SwipeEvent, swipe } from './swipe'

afterEach(() => {
  clearHost()
})

/** Installs a host and hands back an element plus a way to drive its pointer stream. */
const setup = (): {
  element: HostElement
  pointer: (phase: string, at: { x: number; y: number }) => void
} => {
  const memory = createMemoryHost()
  setHost(memory.host)
  const element = memory.host.createElement('view')
  return {
    element,
    pointer: (phase, at) =>
      dispatchMemoryEvent(element as unknown as MemoryElement, 'pointer', { id: 1, phase, ...at }),
  }
}

describe('swipe', () => {
  it('recognises a flick along the dominant axis', () => {
    const { element, pointer } = setup()
    const swipes: SwipeEvent[] = []
    swipe(element, { onSwipe: (event) => swipes.push(event), velocity: 0 })

    pointer('down', { x: 200, y: 0 })
    pointer('move', { x: 100, y: 5 })
    pointer('up', { x: 20, y: 10 })

    expect(swipes[0]).toMatchObject({ direction: 'left', distance: 180 })
  })

  it('reports one direction for a diagonal', () => {
    const { element, pointer } = setup()
    const swipes: SwipeEvent[] = []
    swipe(element, { onSwipe: (event) => swipes.push(event), velocity: 0 })

    pointer('down', { x: 0, y: 0 })
    pointer('up', { x: 100, y: 60 })

    // A diagonal flick is one swipe, not two. Reporting both would have every
    // handler deduplicating them.
    expect(swipes).toHaveLength(1)
    expect(swipes[0]?.direction).toBe('right')
  })

  it('ignores a drag that did not go far enough', () => {
    const { element, pointer } = setup()
    const swipes: SwipeEvent[] = []
    swipe(element, { onSwipe: (event) => swipes.push(event), velocity: 0 })

    pointer('down', { x: 0, y: 0 })
    pointer('up', { x: 10, y: 0 })

    expect(swipes).toEqual([])
  })

  it('ignores a long drag that had stopped moving by the end', () => {
    const { element, pointer } = setup()
    const swipes: SwipeEvent[] = []
    swipe(element, { onSwipe: (event) => swipes.push(event), velocity: 50 })

    pointer('down', { x: 0, y: 0 })
    pointer('move', { x: 295, y: 0 })
    pointer('up', { x: 300, y: 0 })

    // Distance alone is not enough. A drag that crossed the screen and then
    // came to rest before the finger lifted is a pan that happened to be long,
    // and treating it as a flick is how a carousel jumps two pages while
    // somebody is reading. Velocity is measured over the LAST movement, which
    // is what distinguishes the two.
    //
    // The events here land in the same millisecond, so the elapsed time is the
    // clamp `pan` applies rather than a real interval — which makes the
    // threshold effectively "how far did the last step travel" and keeps the
    // case deterministic instead of racing a clock.
    expect(swipes).toEqual([])
  })

  it('never fires on a cancelled gesture', () => {
    const { element, pointer } = setup()
    const swipes: SwipeEvent[] = []
    swipe(element, { onSwipe: (event) => swipes.push(event), velocity: 0 })

    pointer('down', { x: 300, y: 0 })
    pointer('cancel', { x: 0, y: 0 })

    // The target took the drag away. Firing here dismisses cards nobody swiped.
    expect(swipes).toEqual([])
  })

  it('recognises a vertical flick too', () => {
    const { element, pointer } = setup()
    const swipes: SwipeEvent[] = []
    swipe(element, { onSwipe: (event) => swipes.push(event), velocity: 0 })

    pointer('down', { x: 0, y: 200 })
    pointer('up', { x: 5, y: 100 })

    expect(swipes[0]?.direction).toBe('up')
  })
})
