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
 * How long a movement's velocity stays a description of the gesture once the
 * pointer stops. A lift within this many milliseconds of the last movement is
 * part of that movement; a lift after it followed a pause, and the gesture had
 * come to rest.
 */
const VELOCITY_WINDOW_MS = 80

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
 *
 * The velocity reported at `onEnd` is the velocity of the last MOVEMENT, not of
 * the lift, and the difference is the whole reason {@link VELOCITY_WINDOW_MS}
 * exists. A pointer almost always lifts exactly where it last moved — every
 * browser fires `pointerup` at the final `pointermove`'s coordinates — so
 * measuring the lift's own displacement reports zero for every real flick, and
 * `swipe`, which gates on velocity, would never recognise one. The last
 * movement's velocity is carried instead, and only while the lift follows it
 * closely enough in time: a drag that crossed the screen and then came to rest
 * before the finger left is a long pan rather than a flick, and it must still
 * report zero.
 */
export const pan = (element: HostElement, handlers: PanHandlers): Dispose => {
  const host = requireHost()

  let active: number | null = null
  let startX = 0
  let startY = 0
  let lastX = 0
  let lastY = 0
  let lastAt = 0
  // The last movement's velocity, carried to `onEnd` when the lift adds no
  // displacement of its own. See the note above.
  let lastVx = 0
  let lastVy = 0

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
      const moved = eventAt(pointer, at, false)
      handlers.onMove?.(moved)
      lastX = pointer.x
      lastY = pointer.y
      lastAt = at
      lastVx = moved.vx
      lastVy = moved.vy
      return
    }

    // Up or cancel: report, then forget, so the next down starts cleanly even
    // if the handler threw.
    const settled = eventAt(pointer, at, pointer.phase === 'cancel')
    // A lift that landed exactly where the pointer last moved carries no
    // movement information of its own, so the last movement's velocity is what
    // the gesture was actually doing — but only if the lift followed it closely.
    const stationary = pointer.x === lastX && pointer.y === lastY
    const finished = stationary && at - lastAt <= VELOCITY_WINDOW_MS ? { ...settled, vx: lastVx, vy: lastVy } : settled
    active = null
    handlers.onEnd?.(finished)
  })

  onCleanup(dispose)
  return dispose
}
