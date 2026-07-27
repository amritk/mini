import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { dispatchMemoryEvent } from '../hosts/dispatch-memory-event'
import { clearHost, mount, setHost } from '../index'
import { createForm } from './create-form'
import { Field } from './field'

afterEach(() => {
  clearHost()
})

/** The three parts a field renders: the visible label, the control, and the error. */
const partsOf = (root: MemoryElement): { label?: MemoryElement; input: MemoryElement; error: MemoryElement } => {
  const wrapper = root.children[0] as MemoryElement
  const children = wrapper.children as MemoryElement[]
  const input = children.find((child) => child.tag === 'input') as MemoryElement
  const texts = children.filter((child) => child.tag === 'text')
  return {
    label: texts.length > 1 ? texts[0] : undefined,
    input,
    error: texts[texts.length - 1] as MemoryElement,
  }
}

const textOf = (element: MemoryElement): string => String((element.children[0] as { value?: string })?.value ?? '')

describe('field', () => {
  it('renders a label, a bound control, and a hidden error', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const form = createForm({ initialValues: { email: '' } })

    mount(memory.rootElement, () => Field({ form, name: 'email', label: 'Email' }))
    const { label, input, error } = partsOf(memory.root)

    expect(textOf(label as MemoryElement)).toBe('Email')
    expect(input.tag).toBe('input')
    expect(error.visible).toBe(false)
  })

  it('gives the control the accessible name the label shows', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const form = createForm({ initialValues: { email: '' } })

    mount(memory.rootElement, () => Field({ form, name: 'email', label: 'Email' }))

    // A native tree has no `<label for>` association to make, so the name has to
    // be an attribute on the control. One prop drives both, or a field could
    // show one word and announce another with nothing to catch it.
    expect(partsOf(memory.root).input.props['label']).toBe('Email')
  })

  it('reveals the error once the field has been blurred', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const form = createForm({
      initialValues: { email: '' },
      validate: (values) => (values.email.includes('@') ? {} : { email: 'Enter a valid email' }),
    })

    mount(memory.rootElement, () => Field({ form, name: 'email', label: 'Email' }))
    const { input, error } = partsOf(memory.root)
    expect(error.visible).toBe(false)

    dispatchMemoryEvent(input, 'blur')

    expect(error.visible).toBe(true)
    expect(textOf(error)).toBe('Enter a valid email')
  })

  it('announces the error through the control rather than only showing it', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const form = createForm({
      initialValues: { email: '' },
      validate: () => ({ email: 'Enter a valid email' }),
    })

    mount(memory.rootElement, () => Field({ form, name: 'email', label: 'Email', hint: 'Work address' }))
    const { input } = partsOf(memory.root)
    expect(input.props['hint']).toBe('Work address')

    dispatchMemoryEvent(input, 'blur')

    // Text sitting near a field with nothing tying the two together is how an
    // error reaches a sighted user and nobody else. The error takes the slot
    // because a field that is wrong has something more urgent to say.
    expect(input.props['hint']).toBe('Enter a valid email')
  })

  it('two-way binds the control to the field', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const form = createForm({ initialValues: { email: '' } })

    mount(memory.rootElement, () => Field({ form, name: 'email' }))
    const { input } = partsOf(memory.root)

    input.props['value'] = 'a@b.com'
    dispatchMemoryEvent(input, 'input')
    expect(form.values().email).toBe('a@b.com')

    form.setValue('email', 'c@d.com')
    expect(input.props['value']).toBe('c@d.com')
  })

  it('forwards the control props the vocabulary defines', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const form = createForm({ initialValues: { password: '' } })

    mount(memory.rootElement, () =>
      Field({ form, name: 'password', secure: true, keyboard: 'text', autoComplete: 'current-password' }),
    )
    const { input } = partsOf(memory.root)

    expect(input.props['secure']).toBe(true)
    expect(input.props['autoComplete']).toBe('current-password')
  })

  it('renders no visible label when none was given', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const form = createForm({ initialValues: { email: '' } })

    mount(memory.rootElement, () => Field({ form, name: 'email' }))
    const wrapper = memory.root.children[0] as MemoryElement

    // The wrapper holds the control and the error node, and nothing else — an
    // empty label element would still take up space in a layout.
    expect(wrapper.children).toHaveLength(2)
  })
})
