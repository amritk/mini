import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { clearHost, mount, setHost } from '../index'
import { Row } from './row'
import { defaultTheme } from './theme'

afterEach(() => {
  clearHost()
})

describe('row', () => {
  it('lays its children out in a row on every target', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <Row>
        <text>one</text>
      </Row>
    ))

    // The direction that actually diverges: both targets stack downwards by
    // default, and neither puts children side by side without being told.
    expect((memory.root.children[0] as MemoryElement).style).toEqual({ display: 'flex', flexDirection: 'row' })
  })

  it('resolves a gap against the theme scale', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Row gap="sm" />)

    expect((memory.root.children[0] as MemoryElement).style).toMatchObject({ gap: defaultTheme.space.sm })
  })

  it('adds no semantics, because a row is not a thing to announce', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Row />)

    expect((memory.root.children[0] as MemoryElement).props).toEqual({})
  })
})
