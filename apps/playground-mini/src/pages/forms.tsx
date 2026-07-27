import { signal } from '@amritk/mini'
import { createForm, Field } from '@amritk/mini/forms'

import { Out, Page, Section } from '../lib/ui'

/**
 * `@amritk/mini/forms` — field state as signals, plus two ways to validate.
 * The schema arm runs through `@amritk/runtime-validators`, the eval-free
 * interpreter the rest of mjst uses, so a form validates under a strict CSP
 * with no `new Function` anywhere.
 */
export const FormsPage = (): HTMLElement => (
  <Page
    title="Forms"
    lede="createForm turns a value bag into per-field signals — value, error, touched, dirty — and handles submission. Validation is either a (values) => errors function or a JSON Schema; both feed one code path."
  >
    <FunctionValidated />
    <SchemaValidated />
    <Primitives />
  </Page>
)

/** The plain arm: a validator you can read at a glance. */
type Signup = { email: string; password: string; plan: string; terms: boolean }

const FunctionValidated = (): HTMLElement => {
  const submitted = signal('—')

  const form = createForm<Signup>({
    initialValues: { email: '', password: '', plan: 'pro', terms: false },
    validate: (values) => {
      const errors: Record<string, string> = {}
      if (!values.email.includes('@')) errors['email'] = 'Enter a valid email address'
      if (values.password.length < 8) errors['password'] = 'At least 8 characters'
      if (!values.terms) errors['terms'] = 'You have to accept the terms'
      return errors
    },
    onSubmit: async (values) => {
      // A real submit goes over the network; the delay is here so isSubmitting
      // is visible for longer than a frame.
      await new Promise((resolve) => setTimeout(resolve, 700))
      if (values.email.endsWith('@example.com')) throw new Error('example.com is not accepted')
      submitted(JSON.stringify(values, null, 2))
    },
  })

  return (
    <Section
      title="createForm + Field"
      blurb="<Field> renders the label, the control and the live error message over the same primitives you would otherwise wire by hand. Errors are gated on touched-or-submitted, so the form does not shout at you before you have typed."
    >
      <form
        onSubmit={(event) => {
          void form.handleSubmit(event)
        }}
      >
        <Field
          form={form}
          name="email"
          type="email"
          label="Email"
          placeholder="ada@lovelace.dev"
          class="field"
          errorClass="field-error"
        />
        <Field
          form={form}
          name="password"
          type="password"
          label="Password"
          placeholder="at least 8 characters"
          class="field"
          errorClass="field-error"
        />
        <Field form={form} name="plan" as="select" label="Plan" class="field" errorClass="field-error">
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="team">Team</option>
        </Field>
        <Field
          form={form}
          name="terms"
          type="checkbox"
          label="Accept the terms"
          class="field"
          errorClass="field-error"
        />

        <div class="row">
          <button class="primary" type="submit" disabled={form.isSubmitting}>
            {() => (form.isSubmitting() ? 'submitting…' : 'submit')}
          </button>
          <button type="button" onClick={() => form.reset()}>
            reset
          </button>
          <span class={() => ['pill', form.isValid() ? 'good' : 'bad']}>
            {() => (form.isValid() ? 'valid' : 'invalid')}
          </span>
          <span class="pill" show={form.isDirty}>
            dirty
          </span>
        </div>

        <p class="muted">
          Try <code>someone@example.com</code> — <code>onSubmit</code> throws, and the message lands in{' '}
          <code>form.submitError</code> rather than in an unhandled rejection.
        </p>
        <Out>{() => `submitError: ${form.submitError() ?? 'none'}\nlast submitted:\n${submitted()}`}</Out>
      </form>
    </Section>
  )
}

/**
 * The schema arm. The same form, validated by a JSON Schema object handed
 * straight to `validate` — `createForm` compiles it with `schemaToValidator`.
 */
const PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    handle: { type: 'string', minLength: 3, maxLength: 16, pattern: '^[a-z0-9_]+$' },
    age: { type: 'integer', minimum: 13, maximum: 120 },
    website: { type: 'string', format: 'uri' },
  },
  required: ['handle', 'age'],
} as const

type Profile = { handle: string; age: number; website: string }

const SchemaValidated = (): HTMLElement => {
  const form = createForm<Profile>({
    initialValues: { handle: '', age: 30, website: '' },
    validate: PROFILE_SCHEMA,
  })

  return (
    <Section
      title="Schema validation"
      blurb="Pass a JSON Schema instead of a function and the same field errors come out. Validation runs through @amritk/runtime-validators — no eval, no new Function, so it works under a strict Content-Security-Policy."
    >
      <div class="stack">
        <Field
          form={form}
          name="handle"
          label="Handle (lowercase, 3–16 chars)"
          placeholder="ada_l"
          class="field"
          errorClass="field-error"
        />
        <Field form={form} name="age" type="number" label="Age" class="field" errorClass="field-error" />
        <Field
          form={form}
          name="website"
          label="Website (optional, must be a URI)"
          placeholder="https://…"
          class="field"
          errorClass="field-error"
        />
        <Out>{() => JSON.stringify({ values: form.values(), errors: form.errors() }, null, 2)}</Out>
      </div>
    </Section>
  )
}

/** The primitives underneath, for the forms that outgrow `<Field>`. */
const Primitives = (): HTMLElement => {
  const form = createForm<{ search: string }>({
    initialValues: { search: '' },
    validate: (values) => (values.search.length > 20 ? { search: 'Keep it under 20 characters' } : {}),
  })

  const search = form.field('search')

  return (
    <Section
      title="The primitives"
      blurb="form.field(name) hands back the field's signals and form.bind(name) is a ref that two-way-binds the control and tracks blur. <Field> is exactly these three things composed — reach past it whenever the markup needs to be your own."
    >
      <div class="stack">
        <input placeholder="search…" ref={form.bind('search')} />
        <div class="row">
          <button type="button" onClick={() => form.setValue('search', 'set from code')}>
            setValue
          </button>
          <button type="button" onClick={() => form.setError('search', 'a server-side error')}>
            setError
          </button>
          <button type="button" onClick={() => search.setTouched(true)}>
            setTouched
          </button>
          <button type="button" onClick={() => form.reset()}>
            reset
          </button>
        </div>
        <Out>
          {() =>
            [
              `value:   ${JSON.stringify(search.value())}`,
              `error:   ${search.error() ?? 'none'}`,
              `touched: ${search.touched()}`,
              `dirty:   ${search.dirty()}`,
            ].join('\n')
          }
        </Out>
      </div>
    </Section>
  )
}
