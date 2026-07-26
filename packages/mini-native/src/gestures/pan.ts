import { requireHost } from '../current-host'
import type { PointerEvent } from '../events'
import { onCleanup } from '../on-cleanup'
import type { Dispose, HostElement } from '../types'

/** Where a drag is, and how it got there. */
export type PanEvent = {
  /** Current position, in the element's own box. */
  readonly x: number
  readonly y: number
  /** Distance from where the finger went down. */
  readonly dx: number
  readonly dy: number
  /** Speed of the most recent movement, in density-independent pixels per millisecond. */
  readonly vx: number
  readonly vy: number
  /** Whether the target took the gesture away rather than the user finishing it. */
  readonly cancelled: boolean
}

/** What to do as a drag happens. Every one is optional; most callers want `onMove`. */
export type PanHandlers = {
  onStart?: (event: PanEvent) => void
  onMove?: (event: PanEvent) => void
  /**
   * The drag finished — or was taken away, which is what `cancelled` says.
   *
   * The distinction matters and it is the thing most implementations get wrong:
   * a cancel is a scroll container claiming the drag or a phone call arriving,
   * not the user completing anything. Committing on a cancel means committing
   * gestures nobody made.
   */
  onEnd?: (event: PanEvent) => void
}

/**
 * Recognises a drag on an element.
 *
 * Pure arithmetic over the normalised pointer stream, which is what makes it
 * portable by construction rather than by effort: the host has already
 * reconciled a browser's Pointer Events and an engine's touch events into one
 * shape, so there is nothing platform-specific left for this to know.
 *
 * It registers its own teardown against the enclosing scope, so the ordinary
 * use through `ref` needs nothing else:
 *
 * ```tsx
 * const x = signal(0)
 * <view ref={(element) => pan(element, { onMove: (event) => x(event.dx) })} />
 * ```
 *
 * Only the first pointer down is followed. A second finger arriving mid-drag is
 * ignored rather than fighting the first for control — two fingers are a
 * different gesture, and a pan that quietly became the average of two is worse
 * than one that stayed a pan.
 */
export const pan = (element: HostElement, handlers: PanHandlers): Dispose => {
  const host = requireHost()

  let active: number | null = null
  let startX = 0
  let startY = 0
  let lastX = 0
  let lastY = 0
  let lastAt = 0

  const eventAt = (pointer: PointerEvent, at: number, cancelled: boolean): PanEvent => {
    // Guard the divide rather than the subtraction: two events in the same
    // millisecond are ordinary on a high-refresh display, and an infinite
    // velocity would fling anything reading it clean off the screen.
    const elapsed = Math.max(1, at - lastAt)
    return {
      x: pointer.x,
      y: pointer.y,
      dx: pointer.x - startX,
      dy: pointer.y - startY,
      vx: (pointer.x - lastX) / elapsed,
      vy: (pointer.y - lastY) / elapsed,
      cancelled,
    }
  }

  const dispose = host.addEventListener(element, 'pointer', (raw) => {
    const pointer = raw as PointerEvent
    const at = Date.now()

    if (pointer.phase === 'down') {
      // A second finger during a drag belongs to a different gesture.
      if (active !== null) return
      active = pointer.id
      startX = pointer.x
      startY = pointer.y
      lastX = pointer.x
      lastY = pointer.y
      lastAt = at
      handlers.onStart?.(eventAt(pointer, at, false))
      return
    }

    if (pointer.id !== active) return

    if (pointer.phase === 'move') {
      handlers.onMove?.(eventAt(pointer, at, false))
      lastX = pointer.x
      lastY = pointer.y
      lastAt = at
      return
    }

    // Up or cancel: report, then forget, so the next down starts cleanly even
    // if the handler threw.
    const finished = eventAt(pointer, at, pointer.phase === 'cancel')
    active = null
    handlers.onEnd?.(finished)
  })

  onCleanup(dispose)
  return dispose
}
