import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, setHost, signal } from '../index'
import { Text } from './text'
import { defaultTheme } from './theme'
import { ThemeContext } from './theme-context'

afterEach(() => {
  clearHost()
})

describe('text', () => {
  it('builds a text element with no semantics of its own', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Text>per seat</Text>)

    // Deliberately bare: a run of text means nothing in particular, and saying
    // otherwise would put noise in the accessibility tree. What it does carry
    // is appearance, which is not a semantic and belongs on the style.
    const text = memory.root.children[0] as MemoryElement
    expect(text.props).toEqual({})
    expect(text.tag).toBe('text')
  })

  it('resolves size, weight and tone against the theme', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <Text size="sm" weight="semibold" tone="muted">
        per seat
      </Text>
    ))

    expect((memory.root.children[0] as MemoryElement).style).toEqual({
      ...defaultTheme.size.sm,
      fontWeight: defaultTheme.weight.semibold,
      color: defaultTheme.tone.muted,
    })
  })

  it('renders body text without being asked', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Text>per seat</Text>)

    // A bare `<Text>` has to be the same thing as `<Text size="md">`, or the
    // scale would only apply where somebody remembered to ask for it. The
    // weight is stated even at the default for the same reason the scale states
    // a line height at every step: an unstated one is resolved by the target,
    // and the two targets do not have to resolve it the same way.
    expect((memory.root.children[0] as MemoryElement).style).toEqual({
      ...defaultTheme.size.md,
      fontWeight: defaultTheme.weight.regular,
      color: defaultTheme.tone.default,
    })
  })

  it('follows a theme change with no re-render', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const theme = signal(defaultTheme)

    mount(memory.rootElement, () => ThemeContext.provide(theme, () => <Text tone="accent">per seat</Text>))

    theme({ ...defaultTheme, tone: { ...defaultTheme.tone, accent: '#0f0' } })

    // The reason the context holds a signal rather than a theme: a component
    // runs exactly once, so there is no second read for a new theme to arrive
    // on. What stays live is the value.
    expect((memory.root.children[0] as MemoryElement).style).toMatchObject({ color: '#0f0' })
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
