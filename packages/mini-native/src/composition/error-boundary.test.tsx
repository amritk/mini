import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, onCleanup, setHost, signal } from '../index'
import { createContext } from './create-context'
import { ErrorBoundary } from './error-boundary'

afterEach(() => {
  clearHost()
})

describe('error-boundary', () => {
  it('renders the children when nothing goes wrong', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <ErrorBoundary fallback={() => <text>failed</text>}>{() => <text>fine</text>}</ErrorBoundary>
    ))

    expect(serializeMemoryTree(memory.root)).toContain('"fine"')
  })

  it('renders the fallback when building the children throws', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <ErrorBoundary fallback={(error) => <text>{String(error)}</text>}>
        {() => {
          throw new Error('boom')
        }}
      </ErrorBoundary>
    ))

    // A component runs exactly once, so a throw part-way through leaves a
    // half-built tree with no second render to recover on. On a device that is
    // a dead app rather than a blank area.
    expect(serializeMemoryTree(memory.root)).toContain('"Error: boom"')
  })

  it('rebuilds from scratch on retry', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const broken = signal(true)

    mount(memory.rootElement, () => (
      <ErrorBoundary fallback={(_error, retry) => <text onTap={retry}>failed</text>}>
        {() => {
          if (broken()) throw new Error('boom')
          return <text>recovered</text>
        }}
      </ErrorBoundary>
    ))
    expect(serializeMemoryTree(memory.root)).toContain('"failed"')

    broken(false)
    retryOf(memory)

    expect(serializeMemoryTree(memory.root)).toContain('"recovered"')
  })

  it('tears the failed attempt down before retrying', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const disposed: string[] = []
    const broken = signal(true)

    mount(memory.rootElement, () => (
      <ErrorBoundary fallback={(_error, retry) => <text onTap={retry}>failed</text>}>
        {() => {
          onCleanup(() => disposed.push('attempt'))
          if (broken()) throw new Error('boom')
          return <text>recovered</text>
        }}
      </ErrorBoundary>
    ))

    broken(false)
    retryOf(memory)

    // Whatever the failed attempt managed to register before it threw belongs
    // to that attempt, so a retry has to take it with it — otherwise every
    // retry leaks the bindings of the one before.
    expect(disposed).toEqual(['attempt'])
  })

  it('still sees the context it was written inside after a retry', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const Theme = createContext('light')
    const broken = signal(true)

    mount(memory.rootElement, () =>
      Theme.provide('dark', () => (
        <ErrorBoundary fallback={(_error, retry) => <text onTap={retry}>failed</text>}>
          {() => {
            if (broken()) throw new Error('boom')
            return <text>{Theme.use()}</text>
          }}
        </ErrorBoundary>
      )),
    )

    broken(false)
    retryOf(memory)

    // A retry happens long after `provide` returned, so the boundary has to
    // carry the frame the same way a conditional does.
    expect(serializeMemoryTree(memory.root)).toContain('"dark"')
  })
})

/** Fires the `retry` the fallback wired to its tap handler. */
const retryOf = (memory: ReturnType<typeof createMemoryHost>): void => {
  const wrapper = memory.root.children[0]
  const fallback = wrapper?.kind === 'element' ? wrapper.children[0] : null
  if (fallback?.kind !== 'element') throw new Error('expected a fallback element to tap')
  for (const listener of fallback.listeners.get('tap') ?? []) listener({})
}
