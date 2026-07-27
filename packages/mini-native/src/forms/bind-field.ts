import { bindValue } from '../bind/bind-value'
import { requireHost, scheduleFlush } from '../current-host'
import { effect, type Signal } from '../signals'
import type { Dispose, HostElement } from '../types'
import type { FieldValue } from './create-form'

/**
 * Two-way binds a control to a field's signal, choosing the binding from the
 * signal's own type.
 *
 * **This is the one place the port genuinely diverges from `@amritk/mini`.** On
 * the web, `form.bind` inspects the element it is handed — `instanceof
 * HTMLInputElement`, `element.type === 'checkbox'`, `HTMLSelectElement` — and
 * picks a binding from what it finds. None of that is available here, and the
 * reason is not that the information is hidden: a host node is deliberately
 * opaque, so that the same form code runs against a browser, an engine, and a
 * headless tree.
 *
 * The type of the field's INITIAL VALUE is used instead, and it turns out to be
 * the better signal on both targets. `initialValues: { email: '', age: 0,
 * subscribed: false }` already says exactly what each field is, in the one place
 * a reader is looking for it, and it says so before any element exists. The web
 * version's documentation already described the behaviour this way — "a field's
 * type is whatever its `initialValues` entry is" — while its implementation
 * derived that from the DOM and could therefore disagree with it. Here they
 * cannot disagree.
 *
 * What it costs: an element that does not match its field is a silent mismatch
 * rather than an adapted binding. A `number` field wired to a plain text input
 * simply parses what is typed, which is what was wanted anyway.
 */
export const bindField = (element: HostElement, model: Signal<FieldValue>): Dispose => {
  const current = model()
  if (typeof current === 'boolean') return bindChecked(element, model as Signal<boolean>)
  if (typeof current === 'number') return bindNumber(element, model as Signal<number>)
  return bindValue(element, model as Signal<string>)
}

/**
 * Two-way binds a toggle to a boolean signal.
 *
 * `checked` is one of the tri-state props, so `false` reaches the host as a
 * stated value rather than as "unset it" — which is the whole reason an
 * unchecked box can be told apart from an element that does not check.
 *
 * Read back on `change` rather than `input`: a toggle's value changes when it is
 * committed, and the vocabulary's `input` event is about text being edited.
 */
const bindChecked = (element: HostElement, model: Signal<boolean>): Dispose => {
  const host = requireHost()

  const stop = effect(() => {
    host.setProperty(element, 'checked', model())
    scheduleFlush()
  })

  // Attached from inside an effect so the listener is tied to the enclosing
  // scope, not to the returned dispose alone — see `bindValue` for why that
  // matters when this is reached through a `ref` nobody disposes by hand.
  const detach = effect(() =>
    host.addEventListener(element, 'change', () => model(host.getProperty(element, 'checked') === true)),
  )

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
 */
const bindNumber = (element: HostElement, model: Signal<number>): Dispose => {
  const host = requireHost()

  const stop = effect(() => {
    const value = model()
    const next = Number.isNaN(value) ? '' : String(value)
    if (host.getProperty(element, 'value') === next) return
    host.setProperty(element, 'value', next)
    scheduleFlush()
  })

  const detach = effect(() =>
    host.addEventListener(element, 'input', () => {
      const text = String(host.getProperty(element, 'value') ?? '')
      model(text === '' ? Number.NaN : Number(text))
    }),
  )

  return () => {
    stop()
    detach()
  }
}
