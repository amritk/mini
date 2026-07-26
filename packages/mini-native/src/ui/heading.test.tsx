import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, setHost, signal } from '../index'
import { Heading } from './heading'

afterEach(() => {
  clearHost()
})

describe('heading', () => {
  it('builds a text that says it is a heading at the given depth', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Heading level={3}>Pricing</Heading>)

    expect(serializeMemoryTree(memory.root)).toBe(
      ['<root>', '  <text level=3 role="heading">', '    "Pricing"'].join('\n'),
    )
  })

  it('leaves the depth to the host when none is given', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Heading>Pricing</Heading>)

    // The default belongs to the host — the DOM one builds an <h2> — so the
    // component passes nothing rather than picking a number of its own.
    expect((memory.root.children[0] as MemoryElement).props['level']).toBeUndefined()
  })

  it('takes a reactive text run like any other text', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const plan = signal('Starter')

    mount(memory.rootElement, () => <Heading>{() => plan()}</Heading>)

    plan('Pro')

    expect(serializeMemoryTree(memory.root)).toContain('"Pro"')
  })
})
