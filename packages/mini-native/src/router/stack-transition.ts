import { animate } from '../animate/animate'
import type { AnimationTiming } from '../host'
import type { HostElement } from '../types'

/** Why the stack changed, so a transition can move in the direction that happened. */
export type StackChange = 'push' | 'pop' | 'replace'

/** The two screens a transition has to move, and which way the stack went. */
export type StackTransitionContext = {
  /** What the change was — a screen pushed on, popped off, or swapped in place. */
  change: StackChange
  /**
   * The card arriving, or `null` when nothing is. Always the card, never the
   * screen inside it: the card is the element the stack owns, so animating it
   * cannot collide with a `style` the screen binds for itself.
   */
  entering: HostElement | null
  /** The card leaving, or `null` when nothing is. */
  exiting: HostElement | null
}

/**
 * How a stack change is animated.
 *
 * Returning a promise is what holds the outgoing screen on screen: the stack
 * waits for it before hiding the card underneath and disposing anything popped.
 * Returning nothing settles immediately, which is the same path a host with no
 * `animate` and a user who asked for reduced motion already take.
 *
 * A transition must not leave a style behind — the same rule {@link animate}
 * keeps, and for the same reason. The settled tree has to be identical whether
 * the animation ran, was skipped, or was interrupted by another navigation.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: `undefined` would reject the ordinary implementation — an arrow that animates and returns nothing infers `void`, which is not assignable to it.
export type StackTransition = (context: StackTransitionContext) => void | Promise<unknown>

/**
 * A cross-fade between screens.
 *
 * Deliberately the only transition shipped, and opacity is the reason: it is
 * the one property that means the same thing on every target this runtime has
 * met, and needs to know nothing about how wide the screen is or which edge a
 * push should come from.
 *
 * A slide is the transition a native stack usually wants, and it is left to the
 * app on purpose rather than guessed at here — its distance is the viewport's
 * width, its direction depends on the writing mode, and the spelling of a
 * translation is the one part of the style vocabulary the two targets do not
 * yet agree on. The seam is enough to write one:
 *
 * ```tsx
 * const slide: StackTransition = ({ change, entering, exiting }) => {
 *   const width = dimensions()().width
 *   const from = change === 'pop' ? -width : width
 *   return Promise.all([
 *     entering && animate(entering, [{ left: from }, { left: 0 }], { duration: 220 }).finished,
 *     exiting && animate(exiting, [{ left: 0 }, { left: -from }], { duration: 220 }).finished,
 *   ])
 * }
 * ```
 *
 * ```tsx
 * <RouteStack router={router} transition={fadeTransition()} />
 * ```
 */
export const fadeTransition = (timing: AnimationTiming = { duration: 180, easing: 'ease-out' }): StackTransition => {
  return ({ entering, exiting }) =>
    Promise.all([
      entering === null ? null : animate(entering, [{ opacity: 0 }, { opacity: 1 }], timing).finished,
      // The one leaving fades out over the same span rather than after it. A
      // sequence would mean a gap with neither screen at full opacity, which
      // reads as a flash of whatever is behind the stack.
      exiting === null ? null : animate(exiting, [{ opacity: 1 }, { opacity: 0 }], timing).finished,
    ])
}
