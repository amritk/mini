import { signal } from '../signals'

/**
 * How much of the screen the soft keyboard is covering right now, in the same
 * units every rect on this boundary uses, as one signal the whole app reads.
 *
 * ## Why this is a signal the runtime owns
 *
 * The engine reports the keyboard exactly once per change, through a single
 * global event — `keyboardstatuschanged` on the `GlobalEventEmitter`. That is a
 * push, and a push has the same problem `globalProps` has: whoever subscribes
 * owns the value, so every component that wanted to react would either subscribe
 * again or have the number threaded down to it. Turning it into a signal here
 * means the subscription happens once, at startup, and a layout that has to move
 * out of the keyboard's way reads it the way it reads anything else.
 *
 * Zero means closed. There is no separate "visible" flag because there is no
 * state the height cannot express — `keyboardHeight() > 0` is the whole of it,
 * and a second signal saying the same thing could disagree with this one.
 *
 * @example
 * ```tsx
 * <view style={() => ({ paddingBottom: keyboardHeight() })}>
 * ```
 */
const height = signal(0)

/**
 * Reads the current height. Tracks, so a binding that reads it follows the
 * keyboard opening, closing, and being swapped for a taller one mid-session.
 */
export const keyboardHeight = (): number => height()

/**
 * States the height. {@link trackKeyboard} calls this for you, so an app
 * normally never does — it is exported for the two cases that are not that: a
 * host whose keyboard reporting is its own (the web, where Lynx does not emit
 * `keyboardstatuschanged` at all), and a test that wants a layout rendered
 * against a particular keyboard.
 *
 * Anything that is not a positive finite number lands on zero rather than
 * reaching a style binding, because the failure is otherwise silent and awful:
 * a `NaN` here becomes `padding-bottom: NaNpx`, which the engine drops, so the
 * layout simply stops responding with nothing anywhere to explain why.
 */
export const setKeyboardHeight = (value: number): void => {
  height(Number.isFinite(value) && value > 0 ? value : 0)
}
