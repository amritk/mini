import { addEvent } from '../add-event'
import type { LynxElement } from '../engine/element-api'
import { onCleanup } from '../on-cleanup'
import { signal } from '../signals'
import { untrack } from '../untrack'

/**
 * The field the user is typing in, or `null` when there is not one.
 *
 * Module-level state, which is the right scope rather than a shortcut: exactly
 * one control on a page has focus, because exactly one soft keyboard is up. A
 * per-tree registry would be modelling a thing that cannot happen, and would
 * then have to answer which of two "focused" fields the keyboard belongs to.
 */
const field = signal<LynxElement | null>(null)

/** Reads the focused field. Tracks, so a layout follows focus moving between inputs. */
export const focusedField = (): LynxElement | null => field()

/**
 * Marks a control as one the keyboard must never cover — attach it as a `ref`.
 *
 * ```tsx
 * <KeyboardAvoiding>
 *   <input ref={avoidKeyboard} placeholder="email" />
 *   <textarea ref={avoidKeyboard} />
 * </KeyboardAvoiding>
 * ```
 *
 * `ref` is this runtime's element-extension seam, so this is the whole wiring:
 * no provider, no context, no prop threaded from the input up to whatever moves.
 * The control reports its own focus, {@link KeyboardAvoiding} reads it, and the
 * two never meet.
 *
 * ## Why only `focus`, and never `blur`
 *
 * Because blur is the wrong signal and reacting to it is the classic bug. Moving
 * between two fields fires the first one's blur and the second one's focus, in
 * an order neither the engine nor this package controls — so a layout that
 * cleared on blur would drop to rest and lift again between two adjacent taps,
 * which reads on a device as the whole screen flinching. `lynx-ui` defers its
 * blur by 30 ms to paper over exactly that.
 *
 * There is nothing to paper over if blur is not listened to. The event that
 * matters is the keyboard closing, and that arrives on its own through
 * {@link keyboardHeight} — a blur with no new focus closes the keyboard, the
 * lift goes to zero, and the layout settles. A blur that IS followed by another
 * focus should not settle, and this way it does not even try.
 *
 * The reference is dropped when the surrounding scope is disposed, so a field
 * that leaves the tree — a popped screen, a closed sheet — cannot leave the
 * runtime holding an element nothing renders.
 */
export const avoidKeyboard = (element: LynxElement): void => {
  const stop = addEvent(element, 'bindEvent', 'focus', () => field(element))

  onCleanup(() => {
    stop()
    // Untracked, because a cleanup runs inside whatever scope is being disposed
    // and a tracked read here would enlist this element's teardown as a
    // dependency of it.
    if (untrack(field) === element) field(null)
  })
}
