import { type LynxElement, type StyleValue, signal } from '@amritk/mini-lynx'
import { Show } from '@amritk/mini-lynx/flow'
import { createForm, Field, type Form, schemaToValidator } from '@amritk/mini-lynx/forms'

import { Action, Chip, Panel, Prose, Readout, Row, Stack, TextLine } from '../components'
import { saveProfile } from '../lib/demo-api'

/**
 * `/forms` — `@amritk/mini-lynx/forms`, driving Lynx's own controls.
 *
 * Almost all of this subpath ported from `@amritk/mini` unchanged, because a
 * form is state and state has no platform: values are signals, the aggregate
 * state is `computed`, and the touched-gating of error messages is arithmetic
 * over booleans. Exactly one file had to be written twice — the one that wires a
 * control to a field — and the panels below are arranged around that seam.
 */
export const FormsScreen = (): LynxElement => (
  <Stack gap="md">
    <Prose>
      The web version of this layer inspects the element it is handed — `instanceof HTMLInputElement`, `element.type ===
      'checkbox'` — and picks a binding from what it finds. An engine element here is an opaque handle, so the type of
      the field's INITIAL VALUE decides instead. That is the better end of the trade rather than a concession:
      `initialValues` already says what every field is, in one place, before any element exists, and the two can no
      longer disagree with each other.
    </Prose>
    <Basics />
    <Gating />
    <SchemaValidation />
    <ValueTypes />
    <RawControls />
  </Stack>
)

/**
 * The four styling slots `Field` exposes, filled once so every field on this
 * screen matches.
 *
 * Classes carry everything static and an inline bag carries the rest, which is
 * the same division of labour the stylesheet makes everywhere else: a class is
 * resolved once by the engine, and an inline declaration is written on every
 * change. `--danger` is a custom property from `styles.css`, so the error colour
 * follows the theme switch without this screen knowing which theme is on.
 */
const FIELD_STYLING = {
  class: 'gap-xs',
  labelClass: 'card-meta',
  inputClass: 'field',
  errorClass: 'card-meta',
  style: { marginBottom: 10 } satisfies StyleValue,
  errorStyle: { color: 'var(--danger)' } satisfies StyleValue,
}

/** `createForm` and `Field`, wired end to end, including a submit that fails. */
const Basics = (): LynxElement => {
  const saved = signal('—')

  const form = createForm({
    initialValues: { handle: '', bio: '' },
    validate: (values) => {
      const errors: Record<string, string> = {}
      if (values.handle.length < 3) errors['handle'] = 'At least three characters'
      if (values.bio.length > 80) errors['bio'] = 'Keep it under eighty characters'
      return errors
    },
    onSubmit: async (values) => {
      await saveProfile(values)
      saved(`saved @${values.handle}`)
    },
  })

  return (
    <Panel
      title="createForm · Field"
      blurb="Type “taken” as the handle to watch an async onSubmit reject. The rejection's message lands in form.submitError with no try/catch at the call site, and the form stays filled in so nobody has to retype it."
    >
      <Field
        form={form}
        name="handle"
        label="Handle"
        placeholder="ada"
        type="text"
        confirm-type="next"
        maxlength={24}
        {...FIELD_STYLING}
      />
      <Field
        form={form}
        name="bio"
        label="Bio"
        multiline
        placeholder="one line about you"
        maxlength={120}
        bindconfirm={form.handleSubmit}
        {...FIELD_STYLING}
        inputStyle={{ minHeight: 64 }}
      />

      <Row gap="sm">
        <Action onTap={form.handleSubmit} disabled={form.isSubmitting}>
          {() => (form.isSubmitting() ? 'saving…' : 'save')}
        </Action>
        <Action onTap={form.reset} disabled={() => !form.isDirty()}>
          reset
        </Action>
      </Row>

      <Show when={form.submitError}>{(message) => <Chip tone="bad">{message}</Chip>}</Show>

      <Readout>
        {() =>
          [
            `values:       ${JSON.stringify(form.values())}`,
            `isValid:      ${form.isValid()}    isDirty:      ${form.isDirty()}`,
            `submitted:    ${form.submitted()}    isSubmitting: ${form.isSubmitting()}`,
            `submitError:  ${form.submitError() ?? '—'}`,
            `last save:    ${saved()}`,
          ].join('\n')
        }
      </Readout>

      <Prose>
        `isSubmitting` tracks the promise rather than the tap, so the save button stays disabled for exactly as long as
        the request is in flight. `reset` puts every value back and clears touched, submitted, submitError and
        isSubmitting in one batch — one propagation pass, so the bindings that read several of them run once.
      </Prose>
      <Prose>
        The error message is folded into the control's own `accessibility-label`. Lynx has no `aria-describedby` and
        nothing else that ties one element's text to another's announcement, so text sitting near a field is how an
        error reaches a sighted user and nobody else.
      </Prose>
    </Panel>
  )
}

/** Every error exists from the first keystroke; a message waits to be earned. */
const Gating = (): LynxElement => {
  const form = createForm({
    initialValues: { email: '' },
    validate: (values) => (values.email.includes('@') ? {} : { email: 'Enter a valid email' }),
  })
  const field = form.field('email')

  return (
    <Panel
      title="Validation is live, messages are not"
      blurb="Errors recompute on every keystroke, and each field withholds its message until it has been blurred or the form submitted — so validation feels immediate without shouting at a form nobody has typed into yet."
    >
      <Field form={form} name="email" label="Email" type="email" placeholder="you@example.com" {...FIELD_STYLING} />

      <Row gap="sm">
        <Action onTap={() => field.setTouched()} disabled={field.touched}>
          mark it touched
        </Action>
        <Action onTap={form.handleSubmit}>submit</Action>
        <Action onTap={form.reset} disabled={() => !field.touched() && !form.submitted()}>
          reset
        </Action>
      </Row>

      <Readout>
        {() =>
          [
            `form.errors():          ${JSON.stringify(form.errors())}`,
            `field.error():          ${field.error() ?? 'undefined'}`,
            `field.touched():        ${field.touched()}`,
            `field.dirty():          ${field.dirty()}`,
            `form.submitted():       ${form.submitted()}`,
          ].join('\n')
        }
      </Readout>

      <Prose>
        The two lines at the top of the readout are the whole idea: `form.errors()` is the validator's verdict and is
        always current, while `field.error()` is the same verdict gated on interaction. A screen that wants to disable a
        button reads the first; a screen that wants to display a message reads the second.
      </Prose>
    </Panel>
  )
}

/**
 * The signup rules, as JSON Schema.
 *
 * A pattern rather than `format: 'email'` because the interpreter treats
 * `format` as an annotation rather than an assertion — a schema is only worth
 * showing if what it says on screen is what actually runs.
 */
const SIGNUP_SCHEMA = {
  type: 'object',
  properties: {
    email: { type: 'string', minLength: 3, pattern: '^.+@.+\\..+$' },
    age: { type: 'integer', minimum: 13, maximum: 120 },
  },
  required: ['email', 'age'],
}

/** `schemaToValidator` — the same `(values) => errors` shape, compiled from a schema. */
const SchemaValidation = (): LynxElement => {
  const form = createForm<{ email: string; age: number }>({
    initialValues: { email: '', age: 0 },
    validate: schemaToValidator(SIGNUP_SCHEMA),
  })

  return (
    <Panel
      title="schemaToValidator"
      blurb="Validation runs through @amritk/runtime-validators — the eval-free interpreter — so a form stays CSP-safe and works under a strict Content-Security-Policy where a compiled validator would not. It is an optional peer: install it only if you validate with schemas."
    >
      <Field
        form={form}
        name="email"
        label="Email"
        type="email"
        confirm-type="next"
        placeholder="you@example.com"
        {...FIELD_STYLING}
      />
      <Field form={form} name="age" label="Age" type="number" hint="Thirteen or over" {...FIELD_STYLING} />

      <Action onTap={form.handleSubmit}>validate everything</Action>

      <Readout>
        {() =>
          [
            `values: ${JSON.stringify(form.values())}`,
            `errors: ${JSON.stringify(form.errors())}`,
            `valid:  ${form.isValid()}`,
          ].join('\n')
        }
      </Readout>

      <Prose>
        A schema and a hand-written `(values) =&gt; errors` function feed exactly one code path, so nothing downstream
        knows which style a form used. Only the first error per field surfaces, because a field displays one message —
        and the message is the interpreter's own wording, which is where `form.setError` comes in when an app wants
        friendlier copy or a verdict from a server.
      </Prose>
      <Prose>
        Clear the age field entirely and the schema reports “must be integer”. That is the number binding working as
        intended: an emptied numeric control is `NaN` rather than `0`, so “left blank” and “deliberately zero” stay
        different answers.
      </Prose>
    </Panel>
  )
}

/** The three field shapes, and the fact that the VALUE picks the binding. */
type ProfileValues = { name: string; quantity: number; subscribed: boolean }

const ValueTypes = (): LynxElement => {
  // Stated rather than inferred: `false` would widen to the literal type on its
  // own, and the toggle needs the field to be a boolean.
  const form = createForm<ProfileValues>({
    initialValues: { name: '', quantity: 1, subscribed: false },
  })

  return (
    <Panel
      title="The binding comes from the value, not the element"
      blurb="`''` binds text, `0` binds a coerced number, and `false` binds a toggle. Lynx has no checkbox, no switch and no picker — the tag inventory goes straight from input to textarea — so a boolean field is a control the app builds and this screen builds one."
    >
      <Field form={form} name="name" label="Name" type="text" {...FIELD_STYLING} />
      <Field form={form} name="quantity" label="Quantity" type="number" {...FIELD_STYLING} />
      <Toggle form={form} />

      <Readout>
        {() =>
          Object.entries(form.values())
            .map(([key, value]) => `${key.padEnd(11)} ${JSON.stringify(value)} (${typeof value})`)
            .join('\n')
        }
      </Readout>

      <Prose>
        `quantity` stays a number through every keystroke, so nothing downstream has to remember that a control hands
        back a string. What the arrangement costs is that a control which does not match its field is a silent mismatch
        rather than an adapted binding — which in practice means a numeric field wired to a plain input simply parses
        what is typed, and that was what was wanted anyway.
      </Prose>
    </Panel>
  )
}

type ToggleProps = {
  form: Form<ProfileValues>
}

/**
 * A toggle, spelled the way a runtime with no checkbox has to spell one.
 *
 * The `ref` is the whole wiring: `form.bind` sees a boolean field and installs
 * the toggle binding, which writes the state out as a `checked` attribute — what
 * a stylesheet and a screen reader can both see — and reads it back on `tap`,
 * because tapping IS the gesture when there is no native control to emit
 * anything else. So there is no `bindtap` written here; the binding owns it.
 */
const Toggle = (props: ToggleProps): LynxElement => {
  const field = props.form.field('subscribed')
  const checked = (): boolean => field.value()

  return (
    <view
      class="row gap-sm"
      accessibility-element={true}
      accessibility-traits="button"
      accessibility-label="Subscribed"
      style={{ alignSelf: 'flex-start', paddingTop: 6, paddingBottom: 6, marginBottom: 10 }}
      ref={props.form.bind('subscribed')}
    >
      <view
        style={() => ({
          width: 18,
          height: 18,
          borderRadius: 5,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: checked() ? 'var(--accent)' : 'var(--border)',
          backgroundColor: checked() ? 'var(--accent)' : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <text show={checked} style={{ color: 'var(--on-accent)', fontSize: 12, lineHeight: 16 }}>
          <raw-text text="✓" />
        </text>
      </view>
      <TextLine>Subscribed</TextLine>
    </view>
  )
}

/** The two text controls Lynx has, with the events they actually emit. */
const RawControls = (): LynxElement => {
  const events = signal<readonly string[]>([])
  const note = (line: string): void => events([line, ...events()].slice(0, 7))

  return (
    <Panel
      title="input and textarea are two elements"
      blurb="Not one control with a multiline flag: two tags with two prop types. That is why Field's `multiline` decides what gets built rather than how it behaves, and why it cannot be reactive — swapping which element exists would throw away whatever the user had typed into the other."
    >
      <input
        class="field"
        style={{ marginBottom: 8 }}
        type="email"
        confirm-type="next"
        maxlength={40}
        placeholder="an <input>, type=email, maxlength=40"
        accessibility-label="Single-line control"
        bindfocus={() => note('bindfocus')}
        bindinput={(event) => note(`bindinput   → ${JSON.stringify(event.detail.value)}`)}
        bindconfirm={(event) => note(`bindconfirm → ${JSON.stringify(event.detail.value)}`)}
        bindblur={(event) => note(`bindblur    → ${JSON.stringify(event.detail.value)}`)}
      />
      <textarea
        class="field"
        style={{ minHeight: 64, marginBottom: 8 }}
        confirm-type="done"
        maxlength={120}
        maxlines={4}
        placeholder="a <textarea>, confirm-type=done"
        accessibility-label="Multi-line control"
        bindfocus={() => note('textarea bindfocus')}
        bindinput={(event) => note(`textarea bindinput → ${JSON.stringify(event.detail.value)}`)}
        bindblur={() => note('textarea bindblur')}
      />

      <Readout>{() => (events().length === 0 ? '(type in one of the controls above)' : events().join('\n'))}</Readout>

      <Prose>
        `type` is the soft keyboard and the content the field accepts — text, number, digit, password, tel, email — and
        `confirm-type` is the label on the keyboard's confirm key. Both are the engine's own attributes, spelled the
        engine's way, so Lynx's documentation is the documentation for this screen. `password` is the one value
        `textarea` does not accept, which is the only difference between the two unions.
      </Prose>
      <Prose>
        `bindconfirm` is the confirm key, which is what a form wires to `handleSubmit`: there is no form element in
        Lynx, so there is no submit event and no navigation to prevent. Note also what does NOT come back — a Lynx
        control is a real native view, so what the user types never lands on the element tree, which is why the value is
        written as an attribute and read off `event.detail.value` rather than from the element.
      </Prose>
    </Panel>
  )
}
