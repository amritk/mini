import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, mount, onCleanup, setEngine, signal } from '../index'
import { createFakeEngine, type FakeElement, type FakeEngine } from '../testing/create-fake-engine'
import { Show } from './show'

afterEach(() => {
  clearEngine()
})

/**
 * Every run of text currently in the tree, in document order.
 *
 * A branch's content is asserted through this rather than by searching the
 * serialised tree for a substring, so each case pins what is NOT rendered as
 * firmly as what is — which is the whole question a conditional raises.
 */
const texts = (engine: FakeEngine): string[] => engine.findAll('raw-text').map((node) => String(node.attrs['text']))

/** The wrapper `Show` owns its slot in, which is the mounted tree's only child. */
const wrapperOf = (engine: FakeEngine): FakeElement => engine.page.children[0] as FakeElement

describe('show', () => {
  it('renders the children branch while the condition is truthy', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const open = signal(true)

    mount(engine.pageElement, () => <Show when={open}>{() => <text>open</text>}</Show>)

    expect(texts(engine)).toEqual(['open'])
  })

  it('owns its slot with a wrapper rather than a real box', () => {
    // The same reason `For`'s default container is a wrapper: a conditional must
    // not change what the surrounding tree means, and a `view` here would join
    // both the flex layout and the accessibility tree.
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () => <Show when={true}>{() => <text>open</text>}</Show>)

    expect(wrapperOf(engine).tag).toBe('wrapper')
  })

  it('swaps to the fallback when the condition goes falsy', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const open = signal(true)

    mount(engine.pageElement, () => (
      <Show when={open} fallback={() => <text>closed</text>}>
        {() => <text>open</text>}
      </Show>
    ))

    open(false)

    expect(texts(engine)).toEqual(['closed'])
  })

  it('renders nothing when falsy and no fallback is given', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const open = signal(false)

    mount(engine.pageElement, () => <Show when={open}>{() => <text>open</text>}</Show>)

    // The wrapper element still exists; it is simply empty.
    expect(wrapperOf(engine).children).toHaveLength(0)
  })

  it('switches on truthiness rather than a strict boolean', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const user = signal<{ name: string } | null>(null)

    mount(engine.pageElement, () => (
      <Show when={user} fallback={() => <text>anonymous</text>}>
        {() => <text>signed in</text>}
      </Show>
    ))

    expect(texts(engine)).toEqual(['anonymous'])
    user({ name: 'sam' })
    expect(texts(engine)).toEqual(['signed in'])
  })

  it('tears the hidden branch down so it stops reacting', () => {
    // This is the difference between `Show` and the `show` prop: `show` hides
    // an element that keeps running, while `Show` removes the subtree outright.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const open = signal(true)
    let cleaned = false

    mount(engine.pageElement, () => (
      <Show when={open}>
        {() => {
          onCleanup(() => {
            cleaned = true
          })
          return <text>open</text>
        }}
      </Show>
    ))

    expect(cleaned).toBe(false)
    open(false)
    expect(cleaned).toBe(true)
  })

  it('hands the function child a getter for the narrowed value', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const user = signal<{ name: string } | null>({ name: 'sam' })

    mount(engine.pageElement, () => <Show when={user}>{(value) => <text>{() => value().name}</text>}</Show>)

    expect(texts(engine)).toEqual(['sam'])
  })

  it('updates the child through the getter without rebuilding the branch', () => {
    // The whole reason the child receives a getter rather than a raw value: a
    // truthy→truthy change has to flow into the existing branch, because
    // rebuilding it would drop whatever state it held — a focused input, say.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const user = signal<{ name: string } | null>({ name: 'sam' })
    let builds = 0
    let cleaned = false

    mount(engine.pageElement, () => (
      <Show when={user}>
        {(value) => {
          builds += 1
          onCleanup(() => {
            cleaned = true
          })
          return <text>{() => value().name}</text>
        }}
      </Show>
    ))

    expect(builds).toBe(1)
    user({ name: 'alex' })

    expect(texts(engine)).toEqual(['alex'])
    // Built once and never torn down: the branch survived the change.
    expect(builds).toBe(1)
    expect(cleaned).toBe(false)
  })

  it('keeps the last truthy value readable while the branch is torn down', () => {
    // Both the swap and the child's text binding depend on `when`, so on the way
    // to falsy the child can be read one last time. The getter answers with the
    // previous value instead of the falsy one, so `value().name` cannot throw
    // regardless of which effect runs first.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const user = signal<{ name: string } | null>({ name: 'sam' })

    mount(engine.pageElement, () => (
      <Show when={user} fallback={() => <text>anonymous</text>}>
        {(value) => <text>{() => value().name}</text>}
      </Show>
    ))

    expect(() => user(null)).not.toThrow()
    expect(texts(engine)).toEqual(['anonymous'])
  })
})
