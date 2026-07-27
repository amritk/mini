import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost } from '../hosts/create-memory-host'
import { clearHost, setHost, signal } from '../index'
import { colorScheme } from './color-scheme'

afterEach(() => {
  clearHost()
})

describe('color-scheme', () => {
  it('reports light when the host cannot tell', () => {
    const { host } = createMemoryHost()
    setHost(host)

    // The memory host has no screen, so it says nothing — which is what keeps
    // this documented fallback exercised on every run rather than only when
    // somebody remembers to check it.
    expect(colorScheme()()).toBe('light')
  })

  it('reports what a host that can tell says', () => {
    const { host } = createMemoryHost()
    const scheme = signal<'light' | 'dark'>('dark')
    setHost({ ...host, environment: { colorScheme: scheme } })

    expect(colorScheme()()).toBe('dark')
  })

  it('stays live, so a switch reaches whatever read it', () => {
    const { host } = createMemoryHost()
    const scheme = signal<'light' | 'dark'>('light')
    setHost({ ...host, environment: { colorScheme: scheme } })

    const current = colorScheme()
    scheme('dark')

    // The reason this is a signal and not a value: a component runs exactly
    // once, so a plain string would be frozen at the moment it was built and
    // the switch afterwards is the entire point.
    expect(current()).toBe('dark')
  })
})
