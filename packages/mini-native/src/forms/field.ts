import type { ElementProps } from '../elements'
import { jsx } from '../jsx-runtime'
import type { ClassValue, HostElement, MaybeReactive, StyleValue } from '../types'
import type { FieldValues, Form } from './create-form'

/** Props for {@link Field}, parameterised by the form's value shape `V`. */
export type FieldProps<V extends FieldValues> = {
  /** The form this field belongs to — `form={form}`. */
  form: Form<V>
  /** The field name; must be a key of the form's `initialValues`. */
  name: keyof V & string
  /**
   * The visible label, which is also the control's accessible name.
   *
   * One prop for both, deliberately. On the web these are two things — a
   * `<label for>` element and the accessible name it confers — and a native tree
   * has no such association to make: the name is an attribute on the control
   * itself. Writing them separately would mean every field could have a label
   * that says one thing and announces another, and the mismatch would be
   * invisible until someone used a screen reader.
   */
  label?: string
  /** A longer description, announced alongside the label. */
  hint?: MaybeReactive<string>
  /** Placeholder for the control. */
  placeholder?: MaybeReactive<string>
  /** A multi-line control. Structural, so it cannot be reactive — see the vocabulary's `input`. */
  multiline?: boolean
  /** Which soft keyboard to raise. */
  keyboard?: ElementProps<'input'>['keyboard']
  /** Masks what is typed. */
  secure?: MaybeReactive<boolean>
  /** The confirm key's label on a soft keyboard. */
  submitLabel?: ElementProps<'input'>['submitLabel']
  /** An autofill hint, so the platform's password and address managers can help. */
  autoComplete?: ElementProps<'input'>['autoComplete']
  /** Called when the user confirms the field — wire this to `form.handleSubmit` on the last one. */
  onSubmit?: ElementProps<'input'>['onSubmit']
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
   * The four style props exist alongside the four class ones because a class is
   * the web-only channel: it is a stylesheet lookup on the DOM, a different
   * mechanism again on Lynx, and nothing at all on the memory host. A style bag
   * of density-independent pixels means the same thing everywhere, which makes
   * it the portable default and the one a field styled for both targets should
   * reach for. Ported from `@amritk/mini`, this component arrived carrying only
   * the web half.
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
 * gates the message on touched/submitted, and this renders all three so a screen
 * reads `<Field form={form} name="email" label="Email" />` rather than
 * hand-wiring a `ref`, a label, and a conditional error.
 *
 * ## Two differences from the web sibling, both forced by the vocabulary
 *
 * **There is no `as`.** The web version renders an `input`, a `textarea`, or a
 * `select`; this vocabulary has one text control and a `multiline` flag, and no
 * picker element at all. A picker is a platform-owned surface — a wheel, a
 * sheet, a dropdown — rather than something a five-tag vocabulary can name
 * honestly, so it is left out rather than approximated by something that would
 * look right in a browser and wrong on a device.
 *
 * **The error is announced through `hint`.** That is the one slot the
 * vocabulary has for supplementary text on a control, and it maps to
 * `aria-description` on the web and the accessibility hint natively. Without it
 * the message would be visible text sitting near the field with nothing tying
 * the two together, which is how an error reaches a sighted user and no one
 * else.
 *
 * @example
 * ```tsx
 * const form = createForm({
 *   initialValues: { email: '' },
 *   validate: (values) => (values.email.includes('@') ? {} : { email: 'Enter a valid email' }),
 * })
 *
 * <Field form={form} name="email" label="Email" keyboard="email" onSubmit={form.handleSubmit} />
 * ```
 */
export const Field = <V extends FieldValues>(props: FieldProps<V>): HostElement => {
  const {
    form,
    name,
    label,
    hint,
    class: wrapperClass,
    labelClass,
    inputClass,
    errorClass,
    style: wrapperStyle,
    labelStyle,
    inputStyle,
    errorStyle,
    ...control
  } = props
  const field = form.field(name)

  // The error wins the description slot when there is one: a field that is
  // wrong has something more urgent to say than what it is for.
  const describedBy = (): string => field.error() ?? resolve(hint) ?? ''

  return jsx('view', {
    ...(wrapperClass === undefined ? {} : { class: wrapperClass }),
    ...(wrapperStyle === undefined ? {} : { style: wrapperStyle }),
    children: [
      label === undefined
        ? null
        : jsx('text', {
            ...(labelClass === undefined ? {} : { class: labelClass }),
            ...(labelStyle === undefined ? {} : { style: labelStyle }),
            children: label,
          }),
      jsx('input', {
        ...control,
        ref: form.bind(name),
        ...(label === undefined ? {} : { label }),
        hint: describedBy,
        ...(inputClass === undefined ? {} : { class: inputClass }),
        ...(inputStyle === undefined ? {} : { style: inputStyle }),
      }),
      // Hidden rather than emptied, so an error-only style — a border, spacing —
      // does not paint on a valid field. `error` is already withheld until the
      // field is touched or the form submitted, so this stays quiet on a
      // pristine form and appears the moment a message does.
      jsx('text', {
        ...(errorClass === undefined ? {} : { class: errorClass }),
        ...(errorStyle === undefined ? {} : { style: errorStyle }),
        show: () => field.error() !== undefined,
        children: () => field.error() ?? '',
      }),
    ],
  })
}

/** Reads a possibly-reactive prop once, for the places that only need its current value. */
const resolve = <T>(value: MaybeReactive<T> | undefined): T | undefined =>
  typeof value === 'function' ? (value as () => T)() : value
