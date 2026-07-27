import { afterEach, describe, expect, it } from 'vitest'

import { Show } from '../flow'
import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { clearHost, mount, setHost, signal } from '../index'
import { Text } from './text'
import { defaultTheme, type Theme } from './theme'
import { ThemeContext } from './theme-context'

afterEach(() => {
  clearHost()
})

/** A theme that differs from the default in one visible way. */
const green: Theme = { ...defaultTheme, tone: { ...defaultTheme.tone, default: '#0f0' } }

describe('theme-context', () => {
  it('renders a real theme when nothing provided one', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Text>hi</Text>)

    // Not providing a theme is a supported state rather than a mistake: a
    // component has to render correctly on its own, in a test, with no app
    // around it.
    expect((memory.root.children[0] as MemoryElement).style).toMatchObject({
      color: defaultTheme.tone.default,
    })
  })

  it('reaches components below the provider', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () =>
      ThemeContext.provide(
        () => green,
        () => <Text>hi</Text>,
      ),
    )

    expect((memory.root.children[0] as MemoryElement).style).toMatchObject({ color: '#0f0' })
  })

  it('reaches components a conditional builds later', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const open = signal(false)

    mount(memory.rootElement, () =>
      ThemeContext.provide(
        () => green,
        () => <Show when={open}>{() => <Text>hi</Text>}</Show>,
      ),
    )
    open(true)

    // The hazard the frame capture exists for, reached through the theme rather
    // than through a bare context: without it, everything behind a conditional
    // would silently render in the default theme.
    const wrapper = memory.root.children[0] as MemoryElement
    expect((wrapper.children[0] as MemoryElement).style).toMatchObject({ color: '#0f0' })
  })

  it('switches a whole tree with no re-render', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const theme = signal(defaultTheme)

    mount(memory.rootElement, () => ThemeContext.provide(theme, () => <Text>hi</Text>))
    const text = memory.root.children[0] as MemoryElement

    theme(green)

    // Same element throughout — nothing was rebuilt, a style was mutated. That
    // is the entire argument for the context holding a signal rather than a
    // theme, and it is what a dark-mode toggle costs here.
    expect(memory.root.children[0]).toBe(text)
    expect(text.style).toMatchObject({ color: '#0f0' })
  })
})
