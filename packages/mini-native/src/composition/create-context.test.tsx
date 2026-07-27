import { afterEach, describe, expect, it } from 'vitest'

import { For, Show } from '../flow'
import { createMemoryHost } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, setHost, signal } from '../index'
import { createContext } from './create-context'

afterEach(() => {
  clearHost()
})

describe('create-context', () => {
  it('reads the fallback when nothing provided one', () => {
    const Theme = createContext('light')

    expect(Theme.use()).toBe('light')
  })

  it('reaches anything built inside the provider', () => {
    const Theme = createContext('light')

    const seen = Theme.provide('dark', () => Theme.use())

    expect(seen).toBe('dark')
  })

  it('puts back what was there once the provider returns', () => {
    const Theme = createContext('light')

    Theme.provide('dark', () => Theme.use())

    // Restored rather than left behind: a provider describes a region of the
    // tree, not a moment in time after which everything is dark.
    expect(Theme.use()).toBe('light')
  })

  it('lets an inner provider shadow an outer one', () => {
    const Theme = createContext('light')

    const seen = Theme.provide('dark', () => Theme.provide('high-contrast', () => Theme.use()))

    expect(seen).toBe('high-contrast')
  })

  it('keeps two contexts from colliding', () => {
    const Theme = createContext('light')
    const Locale = createContext('en')

    const seen = Theme.provide('dark', () => Locale.provide('fr', () => [Theme.use(), Locale.use()]))

    expect(seen).toEqual(['dark', 'fr'])
  })

  it('reaches a subtree a conditional builds later', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const Theme = createContext('light')
    const open = signal(false)

    mount(memory.rootElement, () =>
      Theme.provide('dark', () => <Show when={open}>{() => <text>{Theme.use()}</text>}</Show>),
    )

    // The branch is built inside an effect, long after `provide` returned and
    // put the ambient value back. Without the frame capture in `renderChild`
    // this reads "light" — a theme that reaches everything except the parts of
    // the app behind a conditional, failing silently to a plausible default.
    open(true)

    expect(serializeMemoryTree(memory.root)).toContain('"dark"')
  })

  it('reaches rows a collection builds later', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const Theme = createContext('light')
    const rows = signal<string[]>([])

    mount(memory.rootElement, () =>
      Theme.provide('dark', () => (
        <For each={rows}>
          {(row) => (
            <text>
              {row}-{Theme.use()}
            </text>
          )}
        </For>
      )),
    )

    // Same hazard through the other lazy path: rows are built inside the
    // reconciliation effect, which runs whenever the collection changes.
    rows(['a'])

    expect(serializeMemoryTree(memory.root)).toContain('"dark"')
  })

  it('holds a signal so the value can change without a re-render', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const theme = signal('light')
    const Theme = createContext(theme)

    mount(memory.rootElement, () => Theme.provide(theme, () => <text>{Theme.use()}</text>))

    theme('dark')

    // The rule the whole design rests on: a component runs once and therefore
    // reads context once, so what has to stay live is the VALUE. A plain string
    // here would be frozen at build and there would be no second read.
    expect(serializeMemoryTree(memory.root)).toContain('"dark"')
  })
})
