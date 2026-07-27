import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { clearHost, mount, setHost, signal } from '../index'
import { systemTheme } from './system-theme'
import { Text } from './text'
import { darkTheme, defaultTheme, type Theme } from './theme'
import { ThemeContext } from './theme-context'

afterEach(() => {
  clearHost()
})

/** A pair that differs from the built-in one, so a test cannot pass by accident. */
const brand: Theme = { ...defaultTheme, tone: { ...defaultTheme.tone, default: '#0f0' } }
const brandDark: Theme = { ...darkTheme, tone: { ...darkTheme.tone, default: '#00f' } }

describe('system-theme', () => {
  it('resolves to the light theme when the host cannot tell', () => {
    const { host } = createMemoryHost()
    setHost(host)

    // The memory host has no screen and reports nothing, which is what keeps
    // the documented `light` fallback exercised on every run.
    expect(systemTheme()()).toBe(defaultTheme)
  })

  it('resolves to the dark theme when the platform is presenting dark surfaces', () => {
    const { host } = createMemoryHost()
    setHost({ ...host, environment: { colorScheme: signal<'light' | 'dark'>('dark') } })

    expect(systemTheme()()).toBe(darkTheme)
  })

  it('takes a caller-supplied pair', () => {
    const { host } = createMemoryHost()
    setHost({ ...host, environment: { colorScheme: signal<'light' | 'dark'>('dark') } })

    expect(systemTheme(brand, brandDark)()).toBe(brandDark)
  })

  it('stays live, so a scheme change reaches text already on screen', () => {
    const memory = createMemoryHost()
    const scheme = signal<'light' | 'dark'>('light')
    setHost({ ...memory.host, environment: { colorScheme: scheme } })

    mount(memory.rootElement, () => ThemeContext.provide(systemTheme(brand, brandDark), () => <Text>hi</Text>))
    const element = memory.root.children[0] as MemoryElement
    expect(element.style).toMatchObject({ color: '#0f0' })

    scheme('dark')

    // The whole point of the theme being a signal: the element is mutated in
    // place, with no re-render and no rebuild of the tree around it.
    expect(memory.root.children[0]).toBe(element)
    expect(element.style).toMatchObject({ color: '#00f' })
  })
})
