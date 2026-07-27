import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, setHost } from '../index'
import { Button } from './button'

afterEach(() => {
  clearHost()
})

describe('button', () => {
  it('builds a view that says it is a button', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Button label="Save" />)

    expect(serializeMemoryTree(memory.root)).toContain('<view focusable=true label="Save" role="button">')
  })

  it('states that it can be reached, because the targets disagree without it', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Button />)

    // The reason this is worth a test of its own: a real <button> is in the
    // focus order having been asked nothing, and a native view with a button
    // role is not. A component that stayed silent would be operable on the web
    // and unreachable on a device, with both hosts behaving correctly.
    expect((memory.root.children[0] as MemoryElement).props['focusable']).toBe(true)
  })

  it('lets a caller take a button out of the focus order', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Button focusable={false} />)

    // `false` has to survive as a stated opt-out rather than collapsing into
    // "nothing was said" — the tri-state rule, reached through the component.
    expect((memory.root.children[0] as MemoryElement).props['focusable']).toBe(false)
  })

  it('gives a bare label the text element a native target needs', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Button>Save</Button>)

    expect(serializeMemoryTree(memory.root)).toBe(
      ['<root>', '  <view focusable=true role="button">', '    <text>', '      "Save"'].join('\n'),
    )
  })

  it('leaves an already-built child alone', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <Button>
        <text>Save</text>
      </Button>
    ))

    // One text element, not a text element wrapped in another one.
    const button = memory.root.children[0] as MemoryElement
    expect(button.children).toHaveLength(1)
    expect((button.children[0] as MemoryElement).children).toHaveLength(1)
  })

  it('becomes a link under `as`, carrying the destination with it', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <Button as="link" href="/pricing">
        Compare plans
      </Button>
    ))

    expect(serializeMemoryTree(memory.root)).toContain('<view focusable=true href="/pricing" role="link">')
  })

  it('forwards the props it does not own', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const taps: number[] = []

    mount(memory.rootElement, () => <Button testId="save" disabled={true} onTap={() => taps.push(1)} />)

    const button = memory.root.children[0] as MemoryElement
    expect(button.props['testId']).toBe('save')
    expect(button.props['disabled']).toBe(true)
    expect(button.listeners.get('tap')?.size).toBe(1)
  })
})
