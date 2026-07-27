import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, setHost, signal } from '../index'
import { Heading } from './heading'
import { defaultTheme } from './theme'

afterEach(() => {
  clearHost()
})

describe('heading', () => {
  it('builds a text that says it is a heading at the given depth', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Heading level={3}>Pricing</Heading>)

    const heading = memory.root.children[0] as MemoryElement
    expect(heading.props).toEqual({ role: 'heading', level: 3 })
    expect(serializeMemoryTree(memory.root)).toContain('"Pricing"')
  })

  it('takes the scale step the theme pairs with the level', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Heading level={3}>Pricing</Heading>)

    expect((memory.root.children[0] as MemoryElement).style).toMatchObject(defaultTheme.size[defaultTheme.heading[3]])
  })

  it('renders at the theme heading weight without being asked', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Heading>Pricing</Heading>)

    // Without this a heading renders at body weight on BOTH targets and does it
    // consistently, which is the worst way to be wrong: the reset flattens the
    // user agent's bold `<h1>` along with the rest of its opinions, and a
    // native engine never had one to flatten.
    expect((memory.root.children[0] as MemoryElement).style).toMatchObject({
      fontWeight: defaultTheme.weight[defaultTheme.headingWeight],
    })
  })

  it('lets a design disagree with the outline', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <Heading level={2} size="sm">
        Related
      </Heading>
    ))

    // An h2 that renders small — the sidebar section header. If size and level
    // were one prop this would be unsayable, and authors would start choosing
    // heading levels by how big they wanted the text.
    const heading = memory.root.children[0] as MemoryElement
    expect(heading.props['level']).toBe(2)
    expect(heading.style).toMatchObject(defaultTheme.size.sm)
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
