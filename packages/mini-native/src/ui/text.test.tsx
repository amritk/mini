import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, setHost, signal } from '../index'
import { Text } from './text'

afterEach(() => {
  clearHost()
})

describe('text', () => {
  it('builds a plain text element with no semantics of its own', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Text>per seat</Text>)

    // Deliberately bare: a run of text means nothing in particular, and saying
    // otherwise would put noise in the accessibility tree.
    expect(serializeMemoryTree(memory.root)).toBe(['<root>', '  <text>', '    "per seat"'].join('\n'))
  })

  it('forwards the text-specific props', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <Text lines={2} selectable={false}>
        a long description
      </Text>
    ))

    const text = memory.root.children[0] as MemoryElement
    expect(text.props['lines']).toBe(2)
    expect(text.props['selectable']).toBe(false)
  })

  it('keeps a function child reactive', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const count = signal(1)

    mount(memory.rootElement, () => <Text>{() => `${count()} item`}</Text>)

    count(4)

    expect(serializeMemoryTree(memory.root)).toContain('"4 item"')
  })
})
