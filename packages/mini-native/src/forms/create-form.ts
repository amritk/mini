import { addEvent } from '../add-event'
import { onCleanup } from '../on-cleanup'
import { batch, computed, effect, type ReadonlySignal, type Signal, signal } from '../signals'
import type { LynxElement } from '../types'
import { bindField } from './bind-field'
import { type FormErrors, schemaToValidator } from './schema-to-validator'

/** A single field's value. Text controls give strings; toggles give booleans; numeric controls give numbers. */
export type FieldValue = string | number | boolean

/**
 * A form's values, keyed by field.
 *
 * A field's type is whatever its `initialValues` entry is — `''` for text,
 * `false` for a toggle, `0` for a number — and `bind` wires the matching binding
 * from that type. Unlike the web sibling, which reads the same fact off the
 * element it is handed, this is the only source of it: an engine element is an
 * opaque handle. See `bindField` for why that turns out to be the better end of
 * the trade.
 */
export type FieldValues = Record<string, FieldValue>

/**
 * How a form validates. Either a plain function from values to errors, or a
 * JSON Schema object run through `@amritk/runtime-validators`. The two are told
 * apart at runtime by `typeof`: a function is the predicate, anything else is a
 * schema.
 */
export type FormValidate<V extends FieldValues> = ((values: V) => FormErrors) | object

/** Configuration for {@link createForm}. */
export type FormConfig<V extends FieldValues> = {
  /** Starting values; also the target `reset` returns to. Its keys define the form's fields. */
  initialValues: V
  /** Optional validation — a `(values) => errors` function or a JSON Schema. */
  validate?: FormValidate<V>
  /** Runs on a valid submit. May be async; `isSubmitting` tracks its lifetime. */
  onSubmit?: (values: V) => void | Promise<void>
}

/** The reactive state and helpers for one field. */
export type Field<T extends FieldValue = FieldValue> = {
  /** The field's value signal — the same one `bind` wires to the control. */
  value: Signal<T>
  /**
   * The message to display, or `undefined`. Gated on interaction: an error is
   * withheld until the field has been blurred or the form submitted, so a
   * pristine form does not shout at the user.
   */
  error: ReadonlySignal<string | undefined>
  /** Whether the field has been blurred (or the form submitted). */
  touched: ReadonlySignal<boolean>
  /** Whether the value differs from its initial value. */
  dirty: ReadonlySignal<boolean>
  /** Marks the field touched (defaults to `true`). */
  setTouched: (value?: boolean) => void
}

/** A live form: reactive state plus the handlers a view wires up. */
export type Form<V extends FieldValues> = {
  /** All current values as one reactive record. */
  values: ReadonlySignal<V>
  /**
   * Every current error, keyed by field, regardless of touched state — the
   * validator's output with any {@link Form.setError} messages layered on top
   * (a manual error wins over the computed one for that field).
   */
  errors: ReadonlySignal<FormErrors>
  /** Whether there are no errors. */
  isValid: ReadonlySignal<boolean>
  /** Whether any field differs from its initial value. */
  isDirty: ReadonlySignal<boolean>
  /** Whether an async `onSubmit` is in flight. */
  isSubmitting: ReadonlySignal<boolean>
  /** Whether a submit has been attempted (drives error visibility). */
  submitted: ReadonlySignal<boolean>
  /**
   * A form-level error message, or `undefined`. Set when an async `onSubmit`
   * rejects (the rejection's message), so a failed save surfaces without the
   * caller wiring their own `try/catch`; cleared on the next submit and on
   * `reset`.
   */
  submitError: ReadonlySignal<string | undefined>
  /** The reactive state and helpers for one field. Stable across calls. */
  field: <K extends keyof V & string>(name: K) => Field<V[K]>
  /**
   * A `ref` callback that two-way-binds a control to a field and tracks blur —
   * `ref={form.bind('email')}`. Which binding it wires is decided by the type of
   * the field's initial value, not by the element. Cleaned up with the enclosing
   * scope.
   */
  bind: (name: keyof V & string) => (element: LynxElement) => void
  /** Sets a field's value imperatively. */
  setValue: <K extends keyof V & string>(name: K, value: V[K]) => void
  /**
   * Sets or clears a manual error for a field — the hook for server-side
   * validation (`setError('email', 'Already taken')`). It layers over the
   * validator's output and shows as soon as the field is touched or the form
   * submitted, exactly like a computed error. Pass `undefined` to clear it; the
   * error also clears when the field's value next changes, so a corrected field
   * stops showing a stale server message.
   */
  setError: (name: keyof V & string, message: string | undefined) => void
  /** Restores initial values and clears touched/submitted/error/submitting state. */
  reset: () => void
  /**
   * Marks everything touched, validates, and runs `onSubmit` when valid.
   *
   * Takes and ignores an event, so it can be wired straight to a control's
   * confirm key — `<input bindconfirm={form.handleSubmit} />`. There is nothing
   * to cancel: Lynx has no form element and therefore no navigation to prevent,
   * which is why the web version's `preventDefault` has no counterpart here
   * rather than a no-op standing in for one.
   */
  handleSubmit: (event?: unknown) => Promise<void>
}

/**
 * Creates a form: field values, dirty/touched/error state, and submit handling,
 * all as signals.
 *
 * Almost all of this ports from `@amritk/mini` unchanged, which is the point
 * worth noticing: a form is state, and state has no platform. The values are
 * signals, the aggregate state is `computed`, and the only part that had to be
 * rewritten is how a control is wired to a field — see `bindField`.
 *
 * Errors recompute reactively on every keystroke, but each field withholds its
 * message until it has been blurred or the form submitted, so validation feels
 * live without nagging a form the user has not touched yet.
 *
 * @example
 * ```tsx
 * const form = createForm({
 *   initialValues: { email: '' },
 *   validate: (values) => (values.email.includes('@') ? {} : { email: 'Enter a valid email' }),
 *   onSubmit: async (values) => save(values),
 * })
 *
 * <input ref={form.bind('email')} type="email" bindconfirm={form.handleSubmit} />
 * ```
 */
export const createForm = <V extends FieldValues>(config: FormConfig<V>): Form<V> => {
  const keys = Object.keys(config.initialValues) as (keyof V & string)[]
  const runValidate = toValidator(config.validate)

  // Every key came from `initialValues`, so its value is always present; the
  // cast only satisfies `noUncheckedIndexedAccess`, which widens the lookup to
  // include `undefined` for the generic index signature.
  const initialOf = <K extends keyof V & string>(key: K): V[K] => config.initialValues[key] as V[K]

  // Signals are stored uniformly as `Signal<FieldValue>` so the reset/snapshot
  // loops can write any key without hitting the "union of setters" problem;
  // `field`/`setValue` re-narrow to the concrete field type at the boundary.
  const valueSignals = {} as Record<keyof V & string, Signal<FieldValue>>
  const touchedSignals = {} as Record<keyof V & string, Signal<boolean>>
  for (const key of keys) {
    valueSignals[key] = signal<FieldValue>(initialOf(key))
    touchedSignals[key] = signal(false)
  }

  const submitted = signal(false)
  const isSubmitting = signal(false)
  const submitError = signal<string | undefined>(undefined)

  // Manual (e.g. server-side) errors, layered over the validator's output. A
  // field's entry is cleared when its value next changes so a corrected field
  // does not keep showing a stale message.
  const manualErrors = signal<FormErrors>({})

  const values = computed(() => {
    const snapshot = {} as V
    for (const key of keys) snapshot[key] = valueSignals[key]() as V[typeof key]
    return snapshot
  })
  const errors = computed(() => ({ ...runValidate(values()), ...manualErrors() }))
  const isValid = computed(() => Object.keys(errors()).length === 0)
  const isDirty = computed(() => keys.some((key) => valueSignals[key]() !== initialOf(key)))

  // Field objects are memoised so repeated `field(name)` calls (a view may read
  // one in several places) share the same signals rather than re-deriving them.
  const fields = new Map<string, unknown>()
  const field = <K extends keyof V & string>(name: K): Field<V[K]> => {
    const existing = fields.get(name)
    if (existing) return existing as Field<V[K]>
    const built: Field<V[K]> = {
      value: valueSignals[name] as unknown as Signal<V[K]>,
      error: computed(() => (touchedSignals[name]() || submitted() ? errors()[name] : undefined)),
      touched: () => touchedSignals[name](),
      dirty: computed(() => valueSignals[name]() !== initialOf(name)),
      setTouched: (value = true) => touchedSignals[name](value),
    }
    fields.set(name, built)
    return built
  }

  const bind =
    (name: keyof V & string) =>
    (element: LynxElement): void => {
      const dispose = bindField(element, valueSignals[name])

      // Attached from inside an effect for the same reason the bindings are:
      // this is reached through a `ref`, where nobody calls the dispose by hand
      // and teardown belongs to the enclosing scope. Without it a re-mounted
      // control would leave a blur listener attached to a node nobody can see.
      const detach = effect(() => {
        const disposes = [
          addEvent(element, 'bindEvent', 'blur', () => touchedSignals[name](true)),
          // Editing a field clears any manual (server-side) error on it, so a
          // corrected value stops showing a stale message. `tap` is here for the
          // toggles: Lynx has no checkbox element, so a boolean field is an
          // app-built control whose value changes on a tap and which never emits
          // an input event at all. It fires on a text field too — tapping into
          // one clears a stale server message about a value the user is now
          // editing, which is the behaviour anyone would have asked for.
          addEvent(element, 'bindEvent', 'input', () => clearManualError(name)),
          addEvent(element, 'bindEvent', 'tap', () => clearManualError(name)),
        ]
        return () => {
          for (const stop of disposes) stop()
        }
      })

      onCleanup(() => {
        dispose()
        detach()
      })
    }

  const setValue = <K extends keyof V & string>(name: K, value: V[K]): void => {
    valueSignals[name](value)
    clearManualError(name)
  }

  const clearManualError = (name: keyof V & string): void => {
    if (manualErrors()[name] === undefined) return
    const { [name]: _cleared, ...rest } = manualErrors()
    manualErrors(rest)
  }

  const setError = (name: keyof V & string, message: string | undefined): void => {
    if (message === undefined) {
      clearManualError(name)
      return
    }
    manualErrors({ ...manualErrors(), [name]: message })
  }

  const reset = (): void =>
    batch(() => {
      for (const key of keys) {
        valueSignals[key](initialOf(key))
        touchedSignals[key](false)
      }
      submitted(false)
      isSubmitting(false)
      submitError(undefined)
      manualErrors({})
    })

  const handleSubmit = async (): Promise<void> => {
    batch(() => {
      submitted(true)
      submitError(undefined)
      for (const key of keys) touchedSignals[key](true)
    })
    if (!isValid() || !config.onSubmit) return
    isSubmitting(true)
    try {
      await config.onSubmit(values())
    } catch (error) {
      // Surface the failure through `submitError` rather than rejecting — wired
      // as an event handler, a rejection would become an unhandled rejection
      // with nowhere to go.
      submitError(error instanceof Error ? error.message : String(error))
    } finally {
      isSubmitting(false)
    }
  }

  return {
    values,
    errors,
    isValid,
    isDirty,
    isSubmitting,
    submitted,
    submitError,
    field,
    bind,
    setValue,
    setError,
    reset,
    handleSubmit,
  }
}

/**
 * Resolves the configured validation into a single `(values) => errors`
 * function. A missing validator is always-valid; a function is used as-is; a
 * schema object is compiled through {@link schemaToValidator}.
 */
const toValidator = <V extends FieldValues>(validate?: FormValidate<V>): ((values: V) => FormErrors) => {
  if (!validate) return () => ({})
  // The predicate and schema arms overlap structurally (a function is also an
  // object), so TypeScript cannot narrow the union on `typeof` alone — the cast
  // records what the `typeof` check has already proven.
  if (typeof validate === 'function') return validate as (values: V) => FormErrors
  return schemaToValidator(validate)
}
