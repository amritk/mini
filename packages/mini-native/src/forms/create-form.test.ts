import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { dispatchMemoryEvent } from '../hosts/dispatch-memory-event'
import { clearHost, mount, setHost } from '../index'
import type { HostElement } from '../types'
import { createForm } from './create-form'

afterEach(() => {
  clearHost()
})

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

  it('binds a text field and tracks blur through the host', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const form = createForm({ initialValues: { email: '' } })

    mount(memory.rootElement, () => {
      const input = memory.host.createElement('input')
      form.bind('email')(input)
      return input
    })
    const input = memory.root.children[0] as MemoryElement

    input.props['value'] = 'typed@b.com'
    dispatchMemoryEvent(input, 'input')
    expect(form.values().email).toBe('typed@b.com')

    dispatchMemoryEvent(input, 'blur')
    expect(form.field('email').touched()).toBe(true)
  })

  it('binds a boolean field to the checked property', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const form = createForm({ initialValues: { subscribed: false } })

    mount(memory.rootElement, () => {
      const box = memory.host.createElement('input')
      form.bind('subscribed')(box)
      return box
    })
    const box = memory.root.children[0] as MemoryElement

    // Which binding is wired comes from the type of the initial value, not from
    // anything about the element — the one place this port diverges from the
    // web sibling, and the reason the same form code runs on three targets.
    expect(box.props['checked']).toBe(false)

    box.props['checked'] = true
    dispatchMemoryEvent(box, 'change')
    expect(form.values().subscribed).toBe(true)
  })

  it('binds a numeric field, treating an emptied control as blank rather than zero', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const form = createForm({ initialValues: { age: 30 } })

    mount(memory.rootElement, () => {
      const input = memory.host.createElement('input')
      form.bind('age')(input)
      return input
    })
    const input = memory.root.children[0] as MemoryElement
    expect(input.props['value']).toBe('30')

    input.props['value'] = ''
    dispatchMemoryEvent(input, 'input')

    // `Number('')` is 0, which would make a cleared field read as a deliberate
    // zero and snap straight back to it. `NaN` is how "left blank" stays sayable.
    expect(Number.isNaN(form.values().age)).toBe(true)
    expect(input.props['value']).toBe('')
  })

  it('detaches the binding when the scope that made it goes away', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const form = createForm({ initialValues: { email: '' } })
    let input!: MemoryElement

    const dispose = mount(memory.rootElement, () => {
      const element = memory.host.createElement('input')
      form.bind('email')(element)
      input = element as unknown as MemoryElement
      return element as HostElement
    })

    dispose()
    input.props['value'] = 'late@b.com'
    dispatchMemoryEvent(input, 'input')

    // Reached through a `ref`, nobody calls the binding's dispose by hand — so
    // teardown has to belong to the enclosing scope, or an unmounted screen
    // leaves the engine calling into a form nobody can see.
    expect(form.values().email).toBe('')
  })
})
