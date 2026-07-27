import { addEvent } from '../add-event'
import { requireEngine, scheduleFlush } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { effect, type Signal } from '../signals'
import type { Dispose } from '../types'

/**
 * Two-way binding between an `<input>` (or `<textarea>`) and a string signal.
 *
 * The control's value follows the signal, and typing writes the signal back on
 * every `bindinput`. Writing the value back is guarded on inequality, so
 * echoing the character the user just typed never repositions their caret.
 *
 * ## Reading and writing are two different channels, on purpose
 *
 * The value is WRITTEN as the `value` attribute and READ off the event's
 * `detail.value`. That asymmetry is not an oversight — a Lynx `<input>` is a
 * real native control, so what the user types never lands back on the element
 * tree, and `__GetAttributes` would only ever report the last thing this
 * runtime wrote. Reading the element back would therefore report the value
 * before the keystroke and immediately undo it.
 *
 * So the binding remembers what the control is believed to be showing —
 * updated both when it writes and when the engine reports a change — and that
 * is what the inequality guard compares against.
 *
 * ## Composition
 *
 * An IME emits an input event for every intermediate candidate while composing
 * CJK or accented text, and Lynx flags those with `detail.isComposing`. Writing
 * them through would tear the candidate string apart, so nothing is committed
 * until an input event arrives without the flag — which is the engine saying
 * the composition settled. A write to the model that lands mid-composition is
 * not dropped: it is deferred and applied at that point, where it wins over the
 * candidate text, on the grounds that an app clearing a field is being
 * deliberate.
 *
 * ## Why the listener is attached from inside an effect
 *
 * That is what ties it to the enclosing `effectScope` rather than to the
 * returned dispose alone, and it matters because the documented way to reach
 * this is from a `ref`, where the combined dispose is never called by hand and
 * teardown is left to the scope. Without it the signal→control binding would be
 * torn down and the control→signal listener would not, leaving the engine
 * calling a dispatcher for an element nobody can see. Calling the returned
 * dispose by hand detaches it the same way, and doing both is safe: an effect's
 * cleanup runs at most once.
 */
export const bindValue = (element: LynxElement, model: Signal<string>): Dispose => {
  // What the control is believed to be showing. Seeded from the attribute so a
  // control that was given a starting value is not written again for nothing.
  let shown = String(requireEngine().__GetAttributes(element)['value'] ?? '')
  let composing = false
  // A write to the model that arrived mid-composition and still has to land.
  let deferredWrite = false

  /** Pushes the model onto the control, skipping a write that would not change it. */
  const writeToControl = (): void => {
    const next = model()
    if (shown === next) return
    shown = next
    requireEngine().__SetAttribute(element, 'value', next)
    scheduleFlush()
  }

  const stop = effect(() => {
    // Read unconditionally, so the effect keeps tracking the model even on the
    // runs it declines to apply.
    model()
    if (composing) {
      // Writing now would tear the IME's candidate string apart, so the write is
      // remembered and settled when the composition does.
      deferredWrite = true
      return
    }
    writeToControl()
  })

  // No signal is read in here, so this effect never re-runs; it exists purely so
  // that disposing the scope detaches the listener.
  const detach = effect(() =>
    addEvent(element, 'bindEvent', 'input', (event) => {
      const detail = inputDetail(event)
      // Believed-shown tracks the user as well as us, or the next programmatic
      // write would compare against a value the control stopped showing.
      shown = detail.value

      if (detail.isComposing) {
        composing = true
        return
      }

      composing = false
      if (deferredWrite) {
        // The app wrote to the model while the user was mid-composition —
        // clearing the field on submit, say. That is a deliberate override, so it
        // wins over the candidate text rather than being read back and silently
        // discarded. Without this the model would be set from the control below,
        // the two would agree again, and the tracking effect would have nothing
        // left to re-apply: the write simply vanishes.
        deferredWrite = false
        writeToControl()
        return
      }
      model(detail.value)
    }),
  )

  return () => {
    stop()
    detach()
  }
}

/** The part of Lynx's `input` payload this binding reads. */
type InputDetail = {
  value: string
  /** Set while an IME is still composing; the value is a candidate, not a commit. */
  isComposing: boolean
}

/**
 * Reads an `input` payload defensively.
 *
 * The event crosses the engine boundary as `unknown`, and a control that was
 * cleared can legitimately report nothing at all — the model has to end up a
 * string either way rather than `undefined` leaking into a form's values.
 */
const inputDetail = (event: unknown): InputDetail => {
  const detail = (event as { detail?: { value?: unknown; isComposing?: unknown } } | null | undefined)?.detail
  const value = detail?.value
  return {
    value: value === null || value === undefined ? '' : String(value),
    isComposing: detail?.isComposing === true,
  }
}
