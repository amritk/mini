import { afterEach, describe, expect, it } from 'vitest'

import { For } from '../flow'
import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, setHost, signal } from '../index'
import { List } from './list'
import { ListItem } from './list-item'

afterEach(() => {
  clearHost()
})

describe('list', () => {
  it('builds a view that says it is a list', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <List label="Cart" />)

    expect(serializeMemoryTree(memory.root)).toContain('<view label="Cart" role="list"')
  })

  it('survives a control-flow wrapper between it and its items', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const items = signal(['Milk', 'Bread'])

    mount(memory.rootElement, () => (
      <List>
        <For each={items}>{(item) => <ListItem>{item}</ListItem>}</For>
      </List>
    ))

    // The case the whole design was bent around. `For` inserts a wrapper nobody
    // wrote, so a `<ul>` here would have the browser reshape the tree — a
    // parse-level content model no attribute can rescue. A generic element
    // carrying the ARIA role has no content model, so the list survives the
    // wrapper, and the wrapper stays out of the accessibility tree.
    expect(serializeMemoryTree(memory.root)).toBe(
      [
        '<root>',
        '  <view role="list" style={"display":"flex","flexDirection":"column"}>',
        '    <flow role="presentation">',
        '      <view role="listitem">',
        '        <text>',
        '          "Milk"',
        '      <view role="listitem">',
        '        <text>',
        '          "Bread"',
      ].join('\n'),
    )
  })

  it('stacks its items', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <List />)

    expect((memory.root.children[0] as MemoryElement).style).toEqual({ display: 'flex', flexDirection: 'column' })
  })
})
