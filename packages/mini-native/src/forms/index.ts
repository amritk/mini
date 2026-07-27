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
 * picks a binding from what it finds. A host node here is opaque by design, so
 * the type of the field's INITIAL VALUE decides instead: `''` binds text, `0`
 * binds a coerced number, `false` binds a toggle. That is the better end of the
 * trade rather than a concession — `initialValues` already says what each field
 * is, in one place, before any element exists, and the two can no longer
 * disagree with each other. See `bind-field.ts`.
 *
 * `Field` is the other adjustment, and only because the vocabulary is smaller
 * than HTML: there is no `as="select"`, because a picker is a platform-owned
 * surface rather than something five tags can name honestly.
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
 *       <Field form={form} name="email" label="Email" keyboard="email" autoComplete="email" />
 *       <Field form={form} name="password" label="Password" secure={true} onSubmit={form.handleSubmit} />
 *       <Button onTap={form.handleSubmit} disabled={form.isSubmitting}>Sign in</Button>
 *     </view>
 *   )
 * }
 * ```
 */

// Re-exported from `@amritk/mini-helpers/schema`: a schema has no platform in
// it, so this is the arm `@amritk/mini` and this package genuinely share.
export { type FormErrors, schemaToValidator } from '@amritk/mini-helpers/schema'

export { bindField } from './bind-field'
export type { Field as FieldState, FieldValue, FieldValues, Form, FormConfig, FormValidate } from './create-form'
export { createForm } from './create-form'
export { Field, type FieldProps } from './field'
