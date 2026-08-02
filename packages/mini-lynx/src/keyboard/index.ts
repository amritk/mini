/**
 * `@amritk/mini-lynx/keyboard` — keeping the soft keyboard off the field the
 * user is typing in.
 *
 * ## Why this exists at all
 *
 * Because Lynx does not do it. `<input>` does not avoid the keyboard, and the
 * docs say so outright; what the engine offers is one global event —
 * `keyboardstatuschanged`, carrying `'on' | 'off'` and a height — and the rest
 * is layout somebody has to write. Every Lynx app with a form writes it, and
 * every one of them gets the same three things wrong: it lifts by the full
 * keyboard height instead of the overlap, it adds the bottom safe-area inset on
 * top of a keyboard that already covers it, and it clears on `blur`, so moving
 * between two fields makes the screen flinch.
 *
 * So this subpath is the arithmetic, once, with the engine event turned into a
 * signal at the top of it.
 *
 * ## The whole of the wiring
 *
 * ```tsx
 * import { avoidKeyboard, KeyboardAvoiding, trackKeyboard } from '@amritk/mini-lynx/keyboard'
 *
 * setEngine(globalEngine())
 * trackKeyboard()
 *
 * const SignIn = () => (
 *   <KeyboardAvoiding>
 *     <input ref={avoidKeyboard} placeholder="email" />
 *     <input ref={avoidKeyboard} type="password" />
 *   </KeyboardAvoiding>
 * )
 * ```
 *
 * `trackKeyboard()` is the line an app owes this subpath. Without it nothing is
 * feeding the height, and the container simply never moves.
 *
 * ## It does not work on the web, and that is the engine's doing
 *
 * Lynx's own compatibility data lists `keyboardstatuschanged` as unsupported on
 * `web_lynx`. A page running this runtime through a DOM Element PAPI therefore
 * hears nothing from the engine and has to report the keyboard itself — which
 * `visualViewport` makes about fifteen lines. Pass it in as
 * `trackKeyboard({ emitter })`, and everything downstream of the height is the
 * same code on both targets.
 */

export { avoidKeyboard, focusedField } from './avoid-keyboard'
export {
  type KeepAboveKeyboardOptions,
  keepAboveKeyboard,
} from './keep-above-keyboard'
export {
  KeyboardAvoiding,
  type KeyboardAvoidingBehavior,
  type KeyboardAvoidingProps,
} from './keyboard-avoiding'
export { keyboardHeight, setKeyboardHeight } from './keyboard-height'
export { type KeyboardLiftOptions, keyboardLift } from './keyboard-lift'
export {
  type KeyboardEmitter,
  type KeyboardStatus,
  type KeyboardStatusListener,
  type TrackKeyboardOptions,
  trackKeyboard,
} from './track-keyboard'
