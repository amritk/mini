import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, setHost } from '../index'
import { ListItem } from './list-item'

afterEach(() => {
  clearHost()
})

describe('list-item', () => {
  it('builds a view that says it is a list item, and gives its label an element', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <ListItem>Milk</ListItem>)

    expect(serializeMemoryTree(memory.root)).toBe(
      ['<root>', '  <view role="listitem">', '    <text>', '      "Milk"'].join('\n'),
    )
  })

  it('carries no layout of its own', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <ListItem />)

    // An item is whatever the list is made of — a row, a card, a single line —
    // so guessing at layout here would only be something to undo.
    expect((memory.root.children[0] as MemoryElement).style).toBeNull()
  })
})
