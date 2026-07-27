/**
 * `@amritk/mini-native/forms` — field values, dirty/touched/error state, submit
 * handling, and validation, all as signals.
 *
 * ## Almost all of this ported unchanged, and that is the point
 *
 * A form is state, and state has no platform. Values are signals, the aggregate
 * state is `computed`, the touched-gating of error messages is arithmetic over
 * booleans — none of it knows what it is rendering to. The port from
 * `@amritk/mini` changed exactly one thing.
 *
 * **How a control is wired to a field.** The web version inspects the element it
 * is handed — `instanceof HTMLInputElement`, `element.type === 'checkbox'` — and
 * picks a binding from what it finds. An engine element here is an opaque
 * handle, so the type of the field's INITIAL VALUE decides instead: `''` binds
 * text, `0` binds a coerced number, `false` binds a toggle. That is the better
 * end of the trade rather than a concession — `initialValues` already says what
 * each field is, in one place, before any element exists, and the two can no
 * longer disagree with each other. See `bind-field.ts`.
 *
 * `Field` is the other adjustment, and only because Lynx's element set is
 * smaller than HTML's: multi-line is a separate `<textarea>` rather than a flag
 * on `<input>`, there is no `as="select"` because a picker is a platform-owned
 * surface an app presents itself, and the error message is folded into the
 * control's accessible NAME because Lynx has no `aria-describedby` to point at
 * it with.
 *
 * Validation accepts either a plain `(values) => errors` function or a JSON
 * Schema run through `@amritk/runtime-validators` — the eval-free interpreter,
 * so a form stays CSP-safe. That arm is an optional peer: install it only if you
 * validate with schemas.
 *
 * @example
 * ```tsx
 * import { createForm, Field } from '@amritk/mini-native/forms'
 *
 * const SignIn = () => {
 *   const form = createForm({
 *     initialValues: { email: '', password: '' },
 *     validate: (values) => (values.email.includes('@') ? {} : { email: 'Enter a valid email' }),
 *     onSubmit: async (values) => signIn(values),
 *   })
 *
 *   return (
 *     <view>
 *       <Field form={form} name="email" label="Email" type="email" confirm-type="next" />
 *       <Field form={form} name="password" label="Password" type="password" bindconfirm={form.handleSubmit} />
 *       <text bindtap={form.handleSubmit}>Sign in</text>
 *     </view>
 *   )
 * }
 * ```
 */

export { type FormErrors, schemaToValidator } from '@amritk/mini-helpers/schema'

export { bindField } from './bind-field'
export type { Field as FieldState, FieldValue, FieldValues, Form, FormConfig, FormValidate } from './create-form'
export { createForm } from './create-form'
export { Field, type FieldConfirmType, type FieldProps, type FieldType } from './field'
