import type { Dispose, HostElement } from '../types'
import { pan } from './pan'

/** Which way a swipe went. */
export type SwipeDirection = 'left' | 'right' | 'up' | 'down'

/** A completed swipe. */
export type SwipeEvent = {
  readonly direction: SwipeDirection
  /** How far it travelled along that axis, in density-independent pixels. */
  readonly distance: number
  /** How fast it was going when it ended, in pixels per millisecond. */
  readonly velocity: number
}

/** How to recognise a swipe, and what to do with one. */
export type SwipeOptions = {
  onSwipe: (event: SwipeEvent) => void
  /**
   * How far the finger must travel. Defaults to 40, which is roughly the
   * distance below which a drag is more likely to have been a sloppy tap.
   */
  distance?: number
  /**
   * How fast it must be going at the end, in pixels per millisecond. Defaults
   * to 0.2.
   *
   * Distance alone is not enough: a slow careful drag across the screen is a
   * pan that happened to be long, and treating it as a swipe is how a
   * carousel jumps two pages while somebody is reading.
   */
  velocity?: number
}

/**
 * Recognises a flick in one of four directions.
 *
 * Built on {@link pan}, which is the point — the recognisers are arithmetic
 * over one normalised stream, so they compose with each other rather than each
 * needing its own platform handling. Nothing here knows what target it is on.
 *
 * ```tsx
 * <view ref={(element) => swipe(element, { onSwipe: (event) => event.direction === 'left' && next() })} />
 * ```
 *
 * A cancelled gesture never becomes a swipe. That is deliberate and it is the
 * case worth knowing about: a cancel is the target taking the drag away — a
 * scroll container claiming it, a call arriving — not the user completing
 * anything, and firing on it would dismiss cards nobody swiped.
 */
export const swipe = (element: HostElement, options: SwipeOptions): Dispose => {
  const minDistance = options.distance ?? 40
  const minVelocity = options.velocity ?? 0.2

  return pan(element, {
    onEnd: (event) => {
      if (event.cancelled) return

      // The dominant axis wins outright. A diagonal flick is one swipe, not
      // two, and reporting both would have every handler deduplicating them.
      const horizontal = Math.abs(event.dx) >= Math.abs(event.dy)
      const distance = horizontal ? event.dx : event.dy
      const velocity = horizontal ? event.vx : event.vy

      if (Math.abs(distance) < minDistance || Math.abs(velocity) < minVelocity) return

      options.onSwipe({
        direction: horizontal ? (distance < 0 ? 'left' : 'right') : distance < 0 ? 'up' : 'down',
        distance: Math.abs(distance),
        velocity: Math.abs(velocity),
      })
    },
  })
}
