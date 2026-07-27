import { appendChildren } from '../append-children'
import { applyProp } from '../apply-prop'
import { createElement, insert } from '../tree'
import type { ClassValue, LynxElement, MaybeReactive, StyleValue } from '../types'
import type { FieldValues, Form } from './create-form'

/**
 * The soft keyboard and content type a text control asks for — Lynx's `type`
 * attribute, verbatim.
 *
 * `'password'` is the one value `<textarea>` does not accept, which is the only
 * difference between the two elements' unions. Passing it with `multiline` set
 * is the caller asking for something the engine has no way to honour; it is
 * documented rather than made unrepresentable, since splitting `FieldProps`
 * into two shapes to say so would cost every other prop its single home.
 */
export type FieldType = 'text' | 'number' | 'digit' | 'password' | 'tel' | 'email'

/** The label on the soft keyboard's confirm key — Lynx's `confirm-type`. */
export type FieldConfirmType = 'search' | 'send' | 'go' | 'done' | 'next'

/** Props for {@link Field}, parameterised by the form's value shape `V`. */
export type FieldProps<V extends FieldValues> = {
  /** The form this field belongs to — `form={form}`. */
  form: Form<V>
  /** The field name; must be a key of the form's `initialValues`. */
  name: keyof V & string
  /**
   * The visible label, which is also the start of the control's accessible
   * name.
   *
   * One prop for both, deliberately. Lynx has no `<label for>` and nothing that
   * associates one element's text with another's accessible name — the name is
   * an attribute on the control itself. Writing them separately would mean
   * every field could show one word and announce another, and the mismatch
   * would be invisible until somebody used a screen reader.
   */
  label?: string
  /** A longer description, announced after the label. */
  hint?: MaybeReactive<string>
  /**
   * Render a `<textarea>` instead of an `<input>`.
   *
   * Structural, so it cannot be reactive: these are two different elements in
   * Lynx rather than one element with a flag, and swapping which one exists
   * would throw away whatever the user had typed into the other.
   */
  multiline?: boolean
  /** Placeholder text. Style it with `::placeholder`. */
  placeholder?: MaybeReactive<string>
  /** Which soft keyboard to raise, and what the field accepts. */
  type?: MaybeReactive<FieldType>
  /** The confirm key's label on a soft keyboard. */
  'confirm-type'?: MaybeReactive<FieldConfirmType>
  /** Maximum number of characters. Lynx defaults this to 140. */
  maxlength?: MaybeReactive<number>
  /** Show the value without allowing edits. */
  readonly?: MaybeReactive<boolean>
  /** Refuse interaction entirely. */
  disabled?: MaybeReactive<boolean>
  /**
   * Called when the user presses the keyboard's confirm key — wire this to
   * `form.handleSubmit` on the last field. Named the way Lynx names the event,
   * because that is what it is.
   */
  bindconfirm?: (event: unknown) => void
  /** Class for the wrapper. */
  class?: MaybeReactive<ClassValue>
  /** Class for the visible label. */
  labelClass?: MaybeReactive<ClassValue>
  /** Class for the control. */
  inputClass?: MaybeReactive<ClassValue>
  /** Class for the error message. */
  errorClass?: MaybeReactive<ClassValue>
  /**
   * Style for the wrapper.
   *
   * The four style props exist alongside the four class ones because the two
   * channels are good at different things: a class is a stylesheet lookup and
   * the cheap way to say something static, while a style bag is the one that
   * can be driven by a signal. A field styled per-state wants the second.
   */
  style?: MaybeReactive<StyleValue | null>
  /** Style for the visible label. */
  labelStyle?: MaybeReactive<StyleValue | null>
  /** Style for the control. */
  inputStyle?: MaybeReactive<StyleValue | null>
  /** Style for the error message. */
  errorStyle?: MaybeReactive<StyleValue | null>
}

/**
 * A form field wired end to end — label, control, and live error message — over
 * a {@link Form} from {@link createForm}.
 *
 * It is the ergonomic layer the primitives leave to the caller: `form.bind`
 * two-way-binds the value and tracks blur, `form.field(name).error` already
 * gates the message on touched/submitted, and this renders all three so a
 * screen reads `<Field form={form} name="email" label="Email" />` rather than
 * hand-wiring a `ref`, a label, and a conditional error.
 *
 * ## Three things that follow from Lynx rather than from taste
 *
 * **Multi-line is a different ELEMENT.** `<input>` and `<textarea>` are two
 * tags with two prop types, not one control with a flag, so `multiline` decides
 * what gets built rather than how it behaves. That is also why it cannot be
 * reactive.
 *
 * **There is no picker.** The web version renders an `input`, a `textarea`, or
 * a `select`; Lynx has the first two and nothing for the third. A picker is a
 * platform-owned surface — a wheel, a sheet — that an app builds and presents
 * itself, so it is left out rather than approximated.
 *
 * **The error is folded into the accessible NAME.** Lynx has no
 * `aria-describedby` and nothing else that ties one element's text to another's
 * announcement, so the control's own `accessibility-label` is the only channel
 * that reaches a screen reader at all. The label, then the error (or the hint
 * when there is no error), joined — because text sitting near a field with
 * nothing connecting the two is how an error reaches a sighted user and nobody
 * else.
 *
 * @example
 * ```tsx
 * const form = createForm({
 *   initialValues: { email: '' },
 *   validate: (values) => (values.email.includes('@') ? {} : { email: 'Enter a valid email' }),
 * })
 *
 * <Field form={form} name="email" label="Email" type="email" bindconfirm={form.handleSubmit} />
 * ```
 */
export const Field = <V extends FieldValues>(props: FieldProps<V>): LynxElement => {
  const field = props.form.field(props.name)

  const wrapper = createElement('view')
  if (props.class !== undefined) applyProp(wrapper, 'class', props.class)
  if (props.style !== undefined) applyProp(wrapper, 'style', props.style)

  if (props.label !== undefined) {
    const label = createElement('text')
    if (props.labelClass !== undefined) applyProp(label, 'class', props.labelClass)
    if (props.labelStyle !== undefined) applyProp(label, 'style', props.labelStyle)
    appendChildren(label, props.label)
    insert(wrapper, label, null)
  }

  const control = createElement(props.multiline === true ? 'textarea' : 'input')
  for (const name of FORWARDED) {
    const value = props[name]
    if (value !== undefined) applyProp(control, name, value)
  }
  if (props.inputClass !== undefined) applyProp(control, 'class', props.inputClass)
  if (props.inputStyle !== undefined) applyProp(control, 'style', props.inputStyle)
  // The error wins the description slot when there is one: a field that is
  // wrong has something more urgent to say than what it is for.
  applyProp(control, 'accessibility-label', () => join(props.label, field.error() ?? resolve(props.hint)))
  props.form.bind(props.name)(control)
  insert(wrapper, control, null)

  // Hidden rather than emptied, so an error-only style — a border, spacing —
  // does not paint on a valid field. `error` is already withheld until the field
  // is touched or the form submitted, so this stays quiet on a pristine form and
  // appears the moment a message does.
  const error = createElement('text')
  if (props.errorClass !== undefined) applyProp(error, 'class', props.errorClass)
  if (props.errorStyle !== undefined) applyProp(error, 'style', props.errorStyle)
  applyProp(error, 'show', () => field.error() !== undefined)
  appendChildren(error, () => field.error() ?? '')
  insert(wrapper, error, null)

  return wrapper
}

/**
 * The props that go straight onto the control under the name they already have.
 *
 * They are listed rather than spread from a rest object because every one of
 * them is an engine attribute spelled the engine's way, and a rest spread would
 * quietly forward `form`, `name` and the styling props too — writing `form` onto
 * an `<input>` as an attribute holding an object.
 */
const FORWARDED = ['placeholder', 'type', 'confirm-type', 'maxlength', 'readonly', 'disabled', 'bindconfirm'] as const

/** Joins the parts of an accessible name, or reports none when there are none. */
const join = (...parts: (string | undefined)[]): string | undefined => {
  const present = parts.filter((part) => part !== undefined && part !== '')
  return present.length === 0 ? undefined : present.join('. ')
}

/** Reads a possibly-reactive prop, for the places that only need its current value. */
const resolve = <T>(value: MaybeReactive<T> | undefined): T | undefined =>
  typeof value === 'function' ? (value as () => T)() : value
