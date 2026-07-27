import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from '../engine/current-engine'
import { mount } from '../mount'
import { createFakeEngine, type FakeElement, type FakeEngine } from '../testing/create-fake-engine'
import { createForm } from './create-form'
import { Field } from './field'

afterEach(() => {
  clearEngine()
})

/** The three parts a field renders: the visible label, the control, and the error. */
const partsOf = (engine: FakeEngine): { label: FakeElement | undefined; control: FakeElement; error: FakeElement } => {
  const wrapper = engine.find('view') as FakeElement
  const control = wrapper.children.find((child) => child.tag === 'input' || child.tag === 'textarea')
  const texts = wrapper.children.filter((child) => child.tag === 'text')
  return {
    label: texts.length > 1 ? texts[0] : undefined,
    control: control as FakeElement,
    error: texts[texts.length - 1] as FakeElement,
  }
}

/** The literal a `<text>` shows, which lives on its `raw-text` child. */
const textOf = (element: FakeElement): string => String(element.children[0]?.attrs['text'] ?? '')

/** Types into a control the way the engine reports it. */
const type = (engine: FakeEngine, node: FakeElement, value: string): void => {
  engine.dispatch(node, 'input', { detail: { value } })
}

describe('field', () => {
  it('renders a label, a bound control, and a hidden error', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { email: '' } })

    mount(engine.pageElement, () => Field({ form, name: 'email', label: 'Email' }))
    const { label, control, error } = partsOf(engine)

    expect(textOf(label as FakeElement)).toBe('Email')
    expect(control.tag).toBe('input')
    expect(error.styles['display']).toBe('none')
  })

  it('renders a textarea when the field is multi-line', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { bio: '' } })

    mount(engine.pageElement, () => Field({ form, name: 'bio', label: 'Bio', multiline: true }))

    // Two different elements in Lynx rather than one with a flag, which is why
    // `multiline` decides what gets BUILT and cannot be reactive.
    expect(partsOf(engine).control.tag).toBe('textarea')
  })

  it('gives the control the accessible name the label shows', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { email: '' } })

    mount(engine.pageElement, () => Field({ form, name: 'email', label: 'Email' }))

    // Lynx has no `<label for>` and nothing that ties one element's text to
    // another's announcement, so the name has to be an attribute on the control.
    // One prop drives both, or a field could show one word and announce another
    // with nothing to catch it.
    expect(partsOf(engine).control.attrs['accessibility-label']).toBe('Email')
  })

  it('reveals the error once the field has been blurred', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({
      initialValues: { email: '' },
      validate: (values) => (values.email.includes('@') ? {} : { email: 'Enter a valid email' }),
    })

    mount(engine.pageElement, () => Field({ form, name: 'email', label: 'Email' }))
    const { control, error } = partsOf(engine)
    expect(error.styles['display']).toBe('none')

    engine.dispatch(control, 'blur', { detail: { value: '' } })

    expect(error.styles['display']).not.toBe('none')
    expect(textOf(error)).toBe('Enter a valid email')
  })

  it('announces the error through the control rather than only showing it', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({
      initialValues: { email: '' },
      validate: () => ({ email: 'Enter a valid email' }),
    })

    mount(engine.pageElement, () => Field({ form, name: 'email', label: 'Email', hint: 'Work address' }))
    const { control } = partsOf(engine)
    expect(control.attrs['accessibility-label']).toBe('Email. Work address')

    engine.dispatch(control, 'blur', { detail: { value: '' } })

    // Text sitting near a field with nothing tying the two together is how an
    // error reaches a sighted user and nobody else. Lynx has no
    // `aria-describedby`, so the accessible name is the only channel there is —
    // and the error takes the hint's place because a field that is wrong has
    // something more urgent to say than what it is for.
    expect(control.attrs['accessibility-label']).toBe('Email. Enter a valid email')
  })

  it('leaves the accessible name unset when there is nothing to say', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { email: '' } })

    mount(engine.pageElement, () => Field({ form, name: 'email' }))

    // An empty `accessibility-label` would be worse than none: it overrides
    // whatever the engine would otherwise have announced with silence.
    expect('accessibility-label' in partsOf(engine).control.attrs).toBe(false)
  })

  it('two-way binds the control to the field', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { email: '' } })

    mount(engine.pageElement, () => Field({ form, name: 'email' }))
    const { control } = partsOf(engine)

    type(engine, control, 'a@b.com')
    expect(form.values().email).toBe('a@b.com')

    form.setValue('email', 'c@d.com')
    expect(control.attrs['value']).toBe('c@d.com')
  })

  it('forwards the control props under the engine names', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { password: '' } })

    mount(engine.pageElement, () =>
      Field({
        form,
        name: 'password',
        type: 'password',
        'confirm-type': 'done',
        placeholder: 'Your password',
        maxlength: 64,
        readonly: false,
        disabled: false,
      }),
    )
    const { control } = partsOf(engine)

    // No translation table: what an author writes is what the engine receives,
    // so Lynx's documentation is this component's documentation too.
    expect(control.attrs['type']).toBe('password')
    expect(control.attrs['confirm-type']).toBe('done')
    expect(control.attrs['placeholder']).toBe('Your password')
    expect(control.attrs['maxlength']).toBe(64)
  })

  it('does not forward its own props onto the control', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { email: '' } })

    mount(engine.pageElement, () => Field({ form, name: 'email', label: 'Email', hint: 'Work address' }))
    const { control } = partsOf(engine)

    // A rest spread would have written `form` onto an `<input>` as an attribute
    // holding an object, which the engine would either ignore or choke on.
    expect('form' in control.attrs).toBe(false)
    expect('name' in control.attrs).toBe(false)
    expect('hint' in control.attrs).toBe(false)
  })

  it('wires the confirm key straight through', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { email: '' } })
    const confirmed: unknown[] = []

    mount(engine.pageElement, () => Field({ form, name: 'email', bindconfirm: (event) => confirmed.push(event) }))
    engine.dispatch(partsOf(engine).control, 'confirm', { detail: { value: 'a@b.com' } })

    expect(confirmed).toHaveLength(1)
  })

  it('styles each of its three parts through a style bag', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { email: '' } })

    mount(engine.pageElement, () =>
      Field({
        form,
        name: 'email',
        label: 'Email',
        style: { gap: 4 },
        labelStyle: { fontSize: 12 },
        inputStyle: { padding: 10 },
        errorStyle: { color: 'red' },
      }),
    )
    const wrapper = engine.find('view') as FakeElement
    const { label, control, error } = partsOf(engine)

    // Every part is stylable, not just the wrapper: the error message in
    // particular needs its own colour, and it is the one element the caller
    // never gets a handle on.
    expect(wrapper.styles).toEqual({ gap: '4px' })
    expect((label as FakeElement).styles).toEqual({ 'font-size': '12px' })
    expect(control.styles).toEqual({ padding: '10px' })
    // The error carries the hidden `display` on top of its own declarations,
    // because visibility and style share one channel on Lynx.
    expect(error.styles).toEqual({ color: 'red', display: 'none' })
  })

  it('classes each of its three parts', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { email: '' } })

    mount(engine.pageElement, () =>
      Field({
        form,
        name: 'email',
        label: 'Email',
        class: 'field',
        labelClass: 'field-label',
        inputClass: 'field-input',
        errorClass: 'field-error',
      }),
    )
    const wrapper = engine.find('view') as FakeElement
    const { label, control, error } = partsOf(engine)

    expect(wrapper.classes).toBe('field')
    expect((label as FakeElement).classes).toBe('field-label')
    expect(control.classes).toBe('field-input')
    expect(error.classes).toBe('field-error')
  })

  it('styles each of its three parts through a style bag', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { email: '' } })

    mount(engine.pageElement, () =>
      Field({
        form,
        name: 'email',
        label: 'Email',
        style: { gap: 4 },
        labelStyle: { fontSize: 12 },
        inputStyle: { padding: 10 },
        errorStyle: { color: 'red' },
      }),
    )
    const wrapper = engine.find('view') as FakeElement
    const { label, control, error } = partsOf(engine)

    // The two channels are good at different things — a class says something
    // static once, a style bag is the one a signal can drive — so both have to
    // reach every part of the field rather than only the wrapper.
    expect(wrapper.styles).toEqual({ gap: '4px' })
    expect((label as FakeElement).styles).toEqual({ 'font-size': '12px' })
    expect(control.styles).toEqual({ padding: '10px' })
    expect(error.styles['color']).toBe('red')
  })

  it('renders no visible label when none was given', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const form = createForm({ initialValues: { email: '' } })

    mount(engine.pageElement, () => Field({ form, name: 'email' }))
    const wrapper = engine.find('view') as FakeElement

    // The wrapper holds the control and the error node, and nothing else — an
    // empty label element would still take up space in a layout.
    expect(wrapper.children).toHaveLength(2)
  })
})
