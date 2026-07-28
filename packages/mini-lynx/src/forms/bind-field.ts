import { addEvent } from '../add-event'
import { bindValue } from '../bind/bind-value'
import { requireEngine, scheduleFlush } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { effect, type Signal } from '../signals'
import type { Dispose } from '../types'
import type { FieldValue } from './create-form'

/**
 * Two-way binds a control to a field's signal, choosing the binding from the
 * signal's own type.
 *
 * **This is the one place the port from `@amritk/mini` genuinely diverges.** On
 * the web, `form.bind` inspects the element it is handed — `instanceof
 * HTMLInputElement`, `element.type === 'checkbox'`, `HTMLSelectElement` — and
 * picks a binding from what it finds. None of that is available here, and not
 * because the information is hidden: an engine element is an opaque handle, and
 * the tag it was built with is the engine's business rather than this runtime's.
 *
 * The type of the field's INITIAL VALUE is used instead, and it turns out to be
 * the better signal. `initialValues: { email: '', age: 0, subscribed: false }`
 * already says exactly what each field is, in the one place a reader looks for
 * it, and it says so before any element exists. The web version's documentation
 * already described the behaviour that way — "a field's type is whatever its
 * `initialValues` entry is" — while its implementation derived it from the DOM
 * and could therefore disagree with it. Here they cannot.
 *
 * What it costs: a control that does not match its field is a silent mismatch
 * rather than an adapted binding. A `number` field wired to a plain `<input>`
 * simply parses what is typed, which is what was wanted anyway.
 */
export const bindField = (element: LynxElement, model: Signal<FieldValue>): Dispose => {
  const current = model()
  if (typeof current === 'boolean') return bindToggle(element, model as Signal<boolean>)
  if (typeof current === 'number') return bindNumber(element, model as Signal<number>)
  return bindValue(element, model as Signal<string>)
}

/**
 * Two-way binds a toggle to a boolean signal.
 *
 * Lynx has no checkbox and no switch — the tag inventory goes straight from
 * `<input>` to `<textarea>` — so a toggle is something the app builds out of a
 * `<view>` and styles itself. That is what decides both halves of this binding:
 * the state goes out as a `checked` attribute, which is what a stylesheet and a
 * screen reader can both see, and it comes back on `tap`, because tapping IS
 * the gesture when there is no native control to emit anything else.
 *
 * `false` is written as a stated value rather than clearing the attribute. An
 * unchecked box and an element that does not check are different things, and
 * collapsing them is exactly what a toggle exists to say.
 */
const bindToggle = (element: LynxElement, model: Signal<boolean>): Dispose => {
  const stop = effect(() => {
    requireEngine().__SetAttribute(element, 'checked', model())
    scheduleFlush()
  })

  // Attached from inside an effect so the listener is tied to the enclosing
  // scope, not to the returned dispose alone — see `bindValue` for why that
  // matters when this is reached through a `ref` nobody disposes by hand.
  const detach = effect(() => addEvent(element, 'bindEvent', 'tap', () => model(!model())))

  return () => {
    stop()
    detach()
  }
}

/**
 * Two-way binds a numeric field to a number signal.
 *
 * An empty or unparseable entry is `NaN` rather than `0`, and `NaN` renders as
 * an empty control rather than as the text "NaN". Both halves of that matter:
 * without them a user cannot clear the field — it snaps back to zero the moment
 * they delete the last digit — and a `required` check has no way to tell "left
 * blank" from "deliberately zero". `Number.isNaN(values.age)` is the blank test.
 *
 * `Number('')` is `0`, which is exactly the trap this guards: the empty string
 * has to be turned into `NaN` explicitly, or clearing the field reads back as a
 * deliberate zero.
 *
 * Like {@link bindValue} it writes the `value` attribute and reads the typed
 * text off the event, because a Lynx `<input>` is a real native control and
 * what the user types never lands back on the element tree.
 */
const bindNumber = (element: LynxElement, model: Signal<number>): Dispose => {
  let shown = String(requireEngine().__GetAttributes(element)['value'] ?? '')

  const stop = effect(() => {
    const value = model()
    const next = Number.isNaN(value) ? '' : String(value)
    if (shown === next) return
    shown = next
    requireEngine().__SetAttribute(element, 'value', next)
    scheduleFlush()
  })

  const detach = effect(() =>
    addEvent(element, 'bindEvent', 'input', (event) => {
      const text = typedValue(event)
      shown = text
      model(text === '' ? Number.NaN : Number(text))
    }),
  )

  return () => {
    stop()
    detach()
  }
}

/**
 * Reads the text out of an `input` payload.
 *
 * The event crosses the engine boundary as `unknown`, and a control that was
 * cleared can legitimately report nothing at all — which has to read as an
 * empty field rather than letting `undefined` reach `Number()`, where it would
 * become `NaN` for the wrong reason.
 */
const typedValue = (event: unknown): string => {
  const value = (event as { detail?: { value?: unknown } } | null | undefined)?.detail?.value
  return value === null || value === undefined ? '' : String(value)
}
