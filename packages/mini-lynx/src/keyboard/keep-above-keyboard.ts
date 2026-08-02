// `../elements/invoke` is the one place this subpath reaches sideways into
// another, and it is deliberate: a UI method is how a rect is measured, the
// wrapper around the engine's callback convention already exists there, and a
// second copy of "is the code zero" is exactly the kind of duplication that
// gets the polarity backwards once. The file it imports depends on nothing but
// the engine, so the edge costs a bundle one small module.
import { invoke } from '../elements/invoke'
import type { LynxElement } from '../engine/element-api'
import { pageElement } from '../mount'
import { effect, signal } from '../signals'
import { untrack } from '../untrack'
import { warn } from '../warn'
import { focusedField } from './avoid-keyboard'
import { keyboardLift } from './keyboard-lift'

/** Options for {@link keepAboveKeyboard}. */
export type KeepAboveKeyboardOptions = {
  /**
   * Which element must stay visible. Defaults to {@link focusedField}, which is
   * whatever control was last given `ref={avoidKeyboard}`.
   */
  field?: () => LynxElement | null
  /**
   * What counts as the bottom of the screen. Defaults to the page element.
   *
   * This is the reference edge the keyboard's height is subtracted from, and
   * the default is right whenever the Lynx view fills the screen. Pass
   * something else — or use `inset` on the lift — when it does not.
   */
  bounds?: LynxElement
  /** How far anything has to rise to clear the keyboard. Defaults to `keyboardLift()`. */
  lift?: () => number
}

/** The only part of a `boundingClientRect` this needs. */
type MeasuredRect = {
  readonly bottom: number
}

/**
 * How far a container has to rise so the keyboard does not cover the field
 * inside it, as a getter — measured, so it is exactly enough and never more.
 *
 * {@link KeyboardAvoiding} is this wired to a style binding, and that is the
 * ordinary way to use it. Reach for this directly when the movement is yours to
 * own: an element you are already animating, a sheet with its own detents, a
 * transform this package must not fight for the style channel over.
 *
 * ## The arithmetic, and why it is measured at all
 *
 * Lifting by the keyboard's full height always works and is usually wrong: a
 * field near the top of a form is pushed off the top of the screen to solve a
 * problem it never had. What the field actually needs is its OVERLAP with the
 * keyboard, and that is a fact about layout, so it has to be measured:
 *
 * ```
 * keyboardTop = bounds.bottom - lift
 * overlap     = field.bottom - keyboardTop
 * shift       = max(0, applied + overlap)
 * ```
 *
 * `applied` is what the container has already risen by, and it is in there
 * because the field is measured WHERE IT CURRENTLY IS. Without it, a second
 * field focused while the container is already raised would be measured in its
 * lifted position, report no overlap, and drop the container back to rest.
 *
 * Both rects come from the same call and the same coordinate space, so nothing
 * here has to know about pixel ratios, status bars or notches — which is the
 * other half of why it is measured rather than computed from `SystemInfo`.
 * `lynx-ui` computes it, and pays for it with an `androidStatusBarPlusBottomBarHeight`
 * prop the app has to get right.
 *
 * ## What it does when it cannot measure
 *
 * Falls back to the full lift, and warns. An engine with no `__InvokeUIMethod`,
 * an element that is not laid out yet, a rect that never resolves — in every
 * case the safe answer is the one that definitely clears the keyboard, because
 * the alternative is a container that stays put while the user types into a
 * field they cannot see.
 *
 * Measurement happens on a change of keyboard height or of focus, not
 * continuously — so a field that changes size while the keyboard is already up
 * (a growing `<textarea>`) is not re-measured. Re-run it by writing whatever
 * signal your `field` getter reads.
 */
export const keepAboveKeyboard = (options: KeepAboveKeyboardOptions = {}): (() => number) => {
  const readField = options.field ?? focusedField
  const readLift = options.lift ?? keyboardLift()

  const shift = signal(0)
  /**
   * The last value handed out, kept alongside the signal so the measurement
   * arithmetic can read it without tracking — it is fed back into the next
   * measurement, and a tracked read there would make this effect depend on its
   * own output.
   */
  let applied = 0
  /** Bumped per run, so a rect that resolves after focus moved cannot settle a stale position. */
  let generation = 0

  const settle = (value: number): void => {
    applied = value
    shift(value)
  }

  effect(() => {
    const lift = readLift()
    const field = readField()
    const run = ++generation

    untrack(() => {
      // The keyboard is gone, so whatever was raised goes back to rest. This is
      // also what ends a focus: no blur is listened to anywhere in this module,
      // because the keyboard closing is the honest signal. See `avoidKeyboard`.
      if (lift === 0) {
        settle(0)
        return
      }

      // Nothing has claimed to be a field, so there is nothing to measure
      // against and the whole lift is the only answer that is certainly enough.
      if (!field) {
        settle(lift)
        return
      }

      measure(field, options.bounds ?? pageElement())
        .then(([fieldRect, boundsRect]) => {
          if (run !== generation) return
          const keyboardTop = boundsRect.bottom - lift
          settle(Math.max(0, applied + (fieldRect.bottom - keyboardTop)))
        })
        .catch((error: unknown) => {
          if (run !== generation) return
          warn('could not measure the focused field, so the whole keyboard height is being cleared', error)
          settle(lift)
        })
    })
  })

  return () => shift()
}

/** Both rects, from one round trip each, in the coordinate space they share. */
const measure = (field: LynxElement, bounds: LynxElement): Promise<[MeasuredRect, MeasuredRect]> =>
  Promise.all([invoke<MeasuredRect>(field, 'boundingClientRect'), invoke<MeasuredRect>(bounds, 'boundingClientRect')])
