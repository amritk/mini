import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from '../engine/current-engine'
import { mount } from '../mount'
import { createFakeEngine, type FakeElement, type FakeEngine } from '../testing/create-fake-engine'
import { createElement, insert } from '../tree'
import { createForm } from './create-form'

afterEach(() => {
  clearEngine()
})

/** Types into a control the way the engine reports it — the value rides on the event. */
const type = (engine: FakeEngine, node: FakeElement, value: string): void => {
  engine.dispatch(node, 'input', { detail: { value } })
}

describe('create-form', () => {
  it('starts from the initial values and reports them as one record', () => {
    const form = createForm({ initialValues: { email: '', age: 0, subscribed: false } })

    expect(form.values()).toEqual({ email: '', age: 0, subscribed: false })
    expect(form.isDirty()).toBe(false)
    expect(form.isValid()).toBe(true)
  })

  it('recomputes errors on every change but withholds the message until the field is touched', () => {
    const form = createForm({
      initialValues: { email: '' },
      validate: (values) => (values.email.includes('@') ? {} : { email: 'Enter a valid email' }),
    })
    const email = form.field('email')

    // The error is real from the start — `isValid` says so — and simply not
    // shown yet. That split is what makes validation feel live without a
    // pristine form shouting at someone who has typed nothing.
    expect(form.isValid()).toBe(false)
    expect(email.error()).toBeUndefined()

    email.setTouched()
    expect(email.error()).toBe('Enter a valid email')
  })

  it('shows every error once a submit is attempted', async () => {
    const form = createForm({
      initialValues: { email: '' },
      validate: () => ({ email: 'Required' }),
    })

    await form.handleSubmit()

    expect(form.field('email').error()).toBe('Required')
    expect(form.submitted()).toBe(true)
  })

  it('tracks dirtiness per field and for the form', () => {
    const form = createForm({ initialValues: { email: '', name: '' } })

    form.setValue('email', 'a@b.com')

    expect(form.field('email').dirty()).toBe(true)
    expect(form.field('name').dirty()).toBe(false)
    expect(form.isDirty()).toBe(true)
  })

  it('runs onSubmit only when valid', async () => {
    const submitted: unknown[] = []
    const form = createForm({
      initialValues: { email: '' },
      validate: (values) => (values.email ? {} : { email: 'Required' }),
      onSubmit: (values) => {
        submitted.push(values)
      },
    })

    await form.handleSubmit()
    expect(submitted).toEqual([])

    form.setValue('email', 'a@b.com')
    await form.handleSubmit()
    expect(submitted).toEqual([{ email: 'a@b.com' }])
  })

  it('surfaces a rejected submit through submitError rather than rejecting', async () => {
    const form = createForm({
      initialValues: { email: 'a@b.com' },
      onSubmit: () => Promise.reject(new Error('Server said no')),
    })

    // Wired as an event handler, a rejection would become an unhandled rejection
    // with nowhere to go. The failure is a value instead.
    await expect(form.handleSubmit()).resolves.toBeUndefined()
    expect(form.submitError()).toBe('Server said no')
    expect(form.isSubmitting()).toBe(false)
  })

  it('layers a manual error over the validator and clears it when the value changes', () => {
    const form = createForm({ initialValues: { email: 'taken@b.com' } })
    form.field('email').setTouched()

    form.setError('email', 'Already taken')
    expect(form.field('email').error()).toBe('Already taken')

    form.setValue('email', 'free@b.com')

    // A corrected field that kept showing the server's old complaint is the
    // classic way this feature goes wrong.
    expect(form.field('email').error()).toBeUndefined()
  })

  it('clears a manual error when the user edits the control', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { email: 'taken@b.com' } })
    form.field('email').setTouched()

    mount(engine.pageElement, () => {
      const input = createElement('input')
      form.bind('email')(input)
      return input
    })
    form.setError('email', 'Already taken')

    type(engine, engine.find('input') as FakeElement, 'free@b.com')

    expect(form.field('email').error()).toBeUndefined()
  })

  it('restores everything on reset', async () => {
    const form = createForm({
      initialValues: { email: '' },
      onSubmit: () => Promise.reject(new Error('nope')),
    })
    form.setValue('email', 'a@b.com')
    await form.handleSubmit()

    form.reset()

    expect(form.values()).toEqual({ email: '' })
    expect(form.submitted()).toBe(false)
    expect(form.submitError()).toBeUndefined()
    expect(form.field('email').touched()).toBe(false)
  })

  it('hands back the same field object every time', () => {
    const form = createForm({ initialValues: { email: '' } })

    // A view may read one field in several places, and re-deriving would give
    // each of them its own error computed over the same state.
    expect(form.field('email')).toBe(form.field('email'))
  })

  it('binds a text field and tracks blur', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { email: '' } })

    mount(engine.pageElement, () => {
      const input = createElement('input')
      form.bind('email')(input)
      return input
    })
    const input = engine.find('input') as FakeElement

    type(engine, input, 'typed@b.com')
    expect(form.values().email).toBe('typed@b.com')

    engine.dispatch(input, 'blur', { detail: { value: 'typed@b.com' } })
    expect(form.field('email').touched()).toBe(true)
  })

  it('binds a boolean field to the checked attribute and flips it on a tap', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { subscribed: false } })

    mount(engine.pageElement, () => {
      const toggle = createElement('view')
      form.bind('subscribed')(toggle)
      return toggle
    })
    const toggle = engine.find('view') as FakeElement

    // Which binding is wired comes from the type of the initial value, not from
    // anything about the element — which is just as well, since Lynx has no
    // checkbox and a toggle is a `<view>` the app styled itself.
    expect(toggle.attrs['checked']).toBe(false)

    engine.dispatch(toggle, 'tap')

    expect(form.values().subscribed).toBe(true)
    expect(toggle.attrs['checked']).toBe(true)
  })

  it('binds a numeric field, treating an emptied control as blank rather than zero', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { age: 30 } })

    mount(engine.pageElement, () => {
      const input = createElement('input')
      form.bind('age')(input)
      return input
    })
    const input = engine.find('input') as FakeElement
    expect(input.attrs['value']).toBe('30')

    engine.clearCalls()
    type(engine, input, '')

    // `Number('')` is 0, which would make a cleared field read as a deliberate
    // zero and snap straight back to it. `NaN` is how "left blank" stays sayable.
    expect(Number.isNaN(form.values().age)).toBe(true)
    // And nothing is written back: the control is already empty, so an echo
    // would only move the caret.
    expect(engine.calls().filter((call) => call.includes('"value"'))).toEqual([])
  })

  it('renders a blank numeric field as an empty control rather than the text NaN', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { age: 30 } })

    mount(engine.pageElement, () => {
      const input = createElement('input')
      form.bind('age')(input)
      return input
    })

    form.setValue('age', Number.NaN)

    expect((engine.find('input') as FakeElement).attrs['value']).toBe('')
  })

  it('follows a numeric field downwards as the model changes', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { age: 30 } })

    mount(engine.pageElement, () => {
      const input = createElement('input')
      form.bind('age')(input)
      return input
    })

    form.setValue('age', 31)

    expect((engine.find('input') as FakeElement).attrs['value']).toBe('31')
  })

  it('detaches the binding when the scope that made it goes away', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { email: '' } })

    const dispose = mount(engine.pageElement, () => {
      const element = createElement('input')
      form.bind('email')(element)
      insert(engine.pageElement, element, null)
      return element
    })
    const input = engine.find('input') as FakeElement

    dispose()
    type(engine, input, 'late@b.com')

    // Reached through a `ref`, nobody calls the binding's dispose by hand — so
    // teardown has to belong to the enclosing scope, or an unmounted screen
    // leaves the engine calling into a form nobody can see.
    expect(form.values().email).toBe('')
    expect(input.events.size).toBe(0)
  })
})
