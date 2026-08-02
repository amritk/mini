import { toGetter } from '../to-getter'
import type { MaybeReactive } from '../types'
import { keyboardHeight } from './keyboard-height'

/** Options for {@link keyboardLift}. */
export type KeyboardLiftOptions = {
  /**
   * How much of the keyboard's height is already accounted for by something
   * else — almost always the bottom safe-area inset a shell has padded for the
   * home indicator, and on a non-immersive Android app the navigation bar too.
   *
   * The keyboard covers that region as well, so a bar already sitting above it
   * has to rise by the DIFFERENCE and no more. Add both and the bar floats a
   * home-indicator's height above the keys, which is the single most common way
   * to get this wrong.
   */
  inset?: MaybeReactive<number>
  /** An extra gap to keep between the keyboard and whatever is being lifted. */
  offset?: MaybeReactive<number>
}

/**
 * How far something has to rise to clear the keyboard, as a getter.
 *
 * `max(0, height - inset) + offset` while the keyboard is open, and exactly zero
 * while it is closed — the offset included, because a gap above a keyboard that
 * is not there is just a hole in the layout.
 *
 * This is the number both behaviours of {@link KeyboardAvoiding} are built on,
 * and it is exported because a layout this package did not anticipate — a
 * floating action button, a bottom sheet with its own detents — needs the same
 * arithmetic and should not re-derive it.
 *
 * @example
 * ```tsx
 * const lift = keyboardLift({ inset: 34 })
 * <view style={() => ({ transform: `translateY(${-lift()}px)`, transition: 'transform 0.25s' })}>
 * ```
 */
export const keyboardLift = (options: KeyboardLiftOptions = {}): (() => number) => {
  const inset = toGetter(options.inset ?? 0)
  const offset = toGetter(options.offset ?? 0)

  return () => {
    const height = keyboardHeight()
    if (height === 0) return 0
    return Math.max(0, height - inset()) + offset()
  }
}
