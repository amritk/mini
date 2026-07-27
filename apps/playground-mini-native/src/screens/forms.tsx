import { blur, focus, type HostElement, type StyleValue, signal } from '@amritk/mini-native'
import { Show } from '@amritk/mini-native/flow'
import { createForm, Field, type Form, schemaToValidator } from '@amritk/mini-native/forms'
import { Row, Stack, Text } from '@amritk/mini-native/ui'

import { saveProfile } from '../lib/demo-api'
import { Action, Chip, Panel, Readout } from '../lib/ui'
import { PaletteContext, RADIUS } from '../theme'

/**
 * `@amritk/mini-native/forms` — field values, dirty/touched/error state, submit
 * handling and validation, all as signals.
 *
 * Almost all of it ported from `@amritk/mini` unchanged, because a form is
 * state and state has no platform. Exactly one file had to be rewritten: the
 * one that wires a control to a field. The web version inspects the element it
 * is handed (`instanceof HTMLInputElement`, `element.type === 'checkbox'`); a
 * host node here is opaque by design, so the type of the field's INITIAL VALUE
 * decides instead — `''` binds text, `0` binds a coerced number, `false` binds a
 * toggle.
 */
export const FormsScreen = (): HostElement => (
  <Stack gap="md">
    <Text tone="muted" size="sm">
      `initialValues` already says what each field is, in one place, before any element exists — so binding from the
      value's type rather than the element's is the better end of the trade rather than a concession to the vocabulary.
      The two can no longer disagree with each other.
    </Text>
    <Basics />
    <SchemaValidation />
    <Imperative />
    <Coercion />
  </Stack>
)

/** The field styling this screen uses, kept in one place like any design system would. */
const fieldStyles = (): {
  wrapper: () => StyleValue
  label: () => StyleValue
  input: () => StyleValue
  error: () => StyleValue
} => {
  const palette = PaletteContext.use()

  return {
    wrapper: () => ({ gap: 4, marginBottom: 10 }),
    label: () => ({ color: palette().muted, fontSize: 12 }),
    input: () => ({
      padding: 10,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: palette().border,
      background: palette().surfaceAlt,
      color: palette().text,
      fontSize: 14,
    }),
    error: () => ({ color: palette().danger, fontSize: 12 }),
  }
}

/** `createForm` + `Field` — the whole thing, wired end to end. */
const Basics = (): HostElement => {
  const styles = fieldStyles()
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
      saved(`saved @${values.handle} at ${new Date().toLocaleTimeString()}`)
    },
  })

  return (
    <Panel
      title="createForm · Field"
      blurb="Type “taken” as the handle to watch an async onSubmit reject: the rejection's message lands in form.submitError with no try/catch at the call site, and the form stays filled in so the user does not retype it."
    >
      <Field
        form={form}
        name="handle"
        label="Handle"
        placeholder="ada"
        autoComplete="username"
        submitLabel="next"
        style={styles.wrapper}
        labelStyle={styles.label}
        inputStyle={styles.input}
        errorStyle={styles.error}
      />
      <Field
        form={form}
        name="bio"
        label="Bio"
        multiline
        placeholder="one line about you"
        onSubmit={form.handleSubmit}
        style={styles.wrapper}
        labelStyle={styles.label}
        inputStyle={() => ({ ...styles.input(), minHeight: 64 })}
        errorStyle={styles.error}
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
            `isValid:      ${form.isValid()}   isDirty: ${form.isDirty()}`,
            `submitted:    ${form.submitted()}   isSubmitting: ${form.isSubmitting()}`,
            `handle.touched: ${form.field('handle').touched()}`,
            `last save:    ${saved()}`,
          ].join('\n')
        }
      </Readout>
      <Text size="sm" tone="muted">
        An error is withheld until the field has been blurred or the form submitted, so a pristine form does not shout
        at somebody who has not typed anything yet. The message reaches the control through `hint` — the vocabulary's
        one slot for supplementary text — which is what stops it being visible text near the field that a screen reader
        never connects to it.
      </Text>
      <Text size="sm" tone="muted">
        The four `*Style` props are the portable half of the styling surface. Classes work here because the DOM host has
        a stylesheet to look them up in; a style bag of density-independent pixels means the same thing on every target,
        which is why this app uses it and why the component grew one.
      </Text>
    </Panel>
  )
}

/** `schemaToValidator` — the same `(values) => errors` shape, compiled from JSON Schema. */
const SIGNUP_SCHEMA = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    age: { type: 'integer', minimum: 13 },
  },
  required: ['email'],
} as const

const SchemaValidation = (): HostElement => {
  const styles = fieldStyles()

  const form = createForm({
    initialValues: { email: '', age: 0 },
    validate: schemaToValidator(SIGNUP_SCHEMA),
  })

  return (
    <Panel
      title="schemaToValidator"
      blurb="Validation runs through @amritk/runtime-validators — the eval-free interpreter, so a form stays CSP-safe and works under a strict Content-Security-Policy where a compiled validator would not. It is an optional peer: install it only if you validate with schemas."
    >
      <Field
        form={form}
        name="email"
        label="Email"
        keyboard="email"
        autoComplete="email"
        placeholder="you@example.com"
        style={styles.wrapper}
        labelStyle={styles.label}
        inputStyle={styles.input}
        errorStyle={styles.error}
      />
      <Field
        form={form}
        name="age"
        label="Age"
        keyboard="number"
        style={styles.wrapper}
        labelStyle={styles.label}
        inputStyle={styles.input}
        errorStyle={styles.error}
      />
      <Action onTap={form.handleSubmit}>validate everything</Action>
      <Readout>{() => `errors: ${JSON.stringify(form.errors())}`}</Readout>
      <Text size="sm" tone="muted">
        A schema and a hand-written `(values) =&gt; errors` function feed exactly one code path, so nothing downstream
        knows which style a form used. Only the first error per field surfaces — a field shows one message.
      </Text>
    </Panel>
  )
}

/** `focus` / `blur` — the only imperative pair in the contract, and why they are calls. */
const Imperative = (): HostElement => {
  const palette = PaletteContext.use()
  const value = signal('')
  let field!: HostElement

  return (
    <Panel
      title="focus · blur · autoFocus"
      blurb="Focusing is an EVENT, not a state: a `focused={true}` prop would still say true after the user tapped elsewhere, and there is no honest way to reconcile that. So it is a call, reached through ref — the seam for anything imperative."
    >
      <input
        ref={(element) => {
          field = element
        }}
        value={value}
        placeholder="focus me from the buttons below"
        label="Imperative target"
        onInput={(event) => value(event.value)}
        style={() => ({
          padding: 10,
          borderRadius: RADIUS.sm,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: palette().border,
          background: palette().surfaceAlt,
          color: palette().text,
          fontSize: 14,
        })}
      />
      <Row gap="sm">
        <Action onTap={() => focus(field)}>focus</Action>
        <Action onTap={() => blur(field)}>blur</Action>
      </Row>
      <Text size="sm" tone="muted">
        `autoFocus` is the other half and is a plain boolean with no reactive form, for the same reason. It applies once
        the tree has been committed rather than during construction — an element that is not yet in the tree cannot take
        focus on any target, so doing it eagerly would silently do nothing.
      </Text>
      <Text size="sm" tone="muted">
        A host that cannot move focus leaves both as no-ops rather than throwing. The Lynx host is exactly that case
        until an app hands it `options.focus`: moving focus is a UI-method call rather than part of the Element PAPI, so
        the adapter asks the app — which knows which engine build it is running on — instead of guessing at a name.
      </Text>
    </Panel>
  )
}

/** The binding decided by the initial value's type, shown all three ways. */
const Coercion = (): HostElement => {
  const styles = fieldStyles()

  // The value shape is stated rather than inferred, because `false` widens to
  // the literal type on its own and the toggle needs the field to be a boolean.
  const form = createForm<ProfileValues>({
    initialValues: { name: '', quantity: 1, subscribed: false },
  })

  return (
    <Panel
      title="Binding from the value, not the element"
      blurb="`''` binds text, `0` binds a coerced number, `false` binds a toggle. The vocabulary has one text control, so a checkbox here is a `role='button'` with `checked` — a picker is left out entirely rather than approximated by something that looks right in a browser and wrong on a device."
    >
      <Field
        form={form}
        name="name"
        label="Name"
        style={styles.wrapper}
        labelStyle={styles.label}
        inputStyle={styles.input}
        errorStyle={styles.error}
      />
      <Field
        form={form}
        name="quantity"
        label="Quantity"
        keyboard="number"
        style={styles.wrapper}
        labelStyle={styles.label}
        inputStyle={styles.input}
        errorStyle={styles.error}
      />
      <Toggle form={form} />
      <Readout>
        {() =>
          Object.entries(form.values())
            .map(
              ([key, entry]) =>
                `${key.padEnd(11)} ${typeof entry === 'string' ? JSON.stringify(entry) : entry} (${typeof entry})`,
            )
            .join('\n')
        }
      </Readout>
      <Text size="sm" tone="muted">
        `quantity` stays a number through every keystroke — the binding coerces on the way in, so nothing downstream has
        to remember that a control hands back a string.
      </Text>
    </Panel>
  )
}

/** The three field types the binding picks between, in one shape. */
type ProfileValues = { name: string; quantity: number; subscribed: boolean }

type ToggleProps = {
  form: Form<ProfileValues>
}

/** A checkbox, spelled the way a five-tag vocabulary has to spell one. */
const Toggle = (props: ToggleProps): HostElement => {
  const palette = PaletteContext.use()
  const field = props.form.field('subscribed')

  return (
    <view
      role="button"
      label="Subscribed"
      checked={field.value}
      onTap={() => field.value(!field.value())}
      style={() => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'flex-start',
        paddingTop: 6,
        paddingBottom: 6,
      })}
    >
      <view
        style={() => ({
          width: 18,
          height: 18,
          borderRadius: 5,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: field.value() ? palette().accent : palette().border,
          background: field.value() ? palette().accent : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        <text show={field.value} style={() => ({ color: palette().onAccent, fontSize: 12, lineHeight: 16 })}>
          ✓
        </text>
      </view>
      <text style={() => ({ color: palette().text, fontSize: 14 })}>Subscribed</text>
    </view>
  )
}
