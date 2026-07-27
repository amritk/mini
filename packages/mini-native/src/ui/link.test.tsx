import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, setHost, signal } from '../index'
import { Link } from './link'

afterEach(() => {
  clearHost()
})

describe('link', () => {
  it('builds a view that says it is a link, and where it goes', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Link href="/docs">Read the docs</Link>)

    expect(serializeMemoryTree(memory.root)).toBe(
      ['<root>', '  <view focusable=true href="/docs" role="link">', '    <text>', '      "Read the docs"'].join('\n'),
    )
  })

  it('tracks a reactive destination', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const plan = signal('starter')

    mount(memory.rootElement, () => <Link href={() => `/plans/${plan()}`} />)

    plan('pro')

    expect((memory.root.children[0] as MemoryElement).props['href']).toBe('/plans/pro')
  })

  it('states that it can be reached, for the same reason a button does', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Link href="/docs" />)

    expect((memory.root.children[0] as MemoryElement).props['focusable']).toBe(true)
  })
})
