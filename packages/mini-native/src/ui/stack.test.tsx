import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { clearHost, mount, setHost, signal } from '../index'
import { Stack } from './stack'

afterEach(() => {
  clearHost()
})

describe('stack', () => {
  it('lays its children out in a column on every target', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <Stack>
        <text>one</text>
      </Stack>
    ))

    // `display` is stated alongside the direction on purpose: a browser ignores
    // `flexDirection` on a `display: block` element, so the direction alone
    // would agree on a device and quietly not on the web.
    expect((memory.root.children[0] as MemoryElement).style).toEqual({ display: 'flex', flexDirection: 'column' })
  })

  it('lets a caller style it without losing the direction', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Stack style={{ padding: 16 }} />)

    expect((memory.root.children[0] as MemoryElement).style).toEqual({
      display: 'flex',
      flexDirection: 'column',
      padding: 16,
    })
  })

  it('keeps a reactive style reactive', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const padding = signal(8)

    mount(memory.rootElement, () => <Stack style={() => ({ padding: padding() })} />)

    padding(24)

    // Flattening a getter into a value here would turn a live binding into a
    // one-time write, which is this package's most expensive mistake to debug.
    expect((memory.root.children[0] as MemoryElement).style).toEqual({
      display: 'flex',
      flexDirection: 'column',
      padding: 24,
    })
  })

  it('lets a caller override the direction outright', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Stack style={{ flexDirection: 'row' }} />)

    expect((memory.root.children[0] as MemoryElement).style).toEqual({ display: 'flex', flexDirection: 'row' })
  })
})
