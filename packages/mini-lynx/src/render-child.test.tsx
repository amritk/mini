import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from './engine/current-engine'
import type { LynxElement } from './engine/element-api'
import { onCleanup } from './on-cleanup'
import { renderChild } from './render-child'
import { signal } from './signals'
import { createFakeEngine, type FakeElement } from './testing/create-fake-engine'
import { createElement, createWrapper } from './tree'

/**
 * The reactive single-slot swap every control-flow component is built on.
 *
 * Almost everything here is about the difference between "a signal the condition
 * read changed" and "the condition selected a DIFFERENT branch". Treating those
 * as one thing is expensive and invisible: the subtree is torn down and rebuilt
 * for a change that selected nothing new, losing focus, scroll position and
 * input state, and paying a full teardown-and-rebuild on the engine.
 */

const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

/** The in-memory node behind an opaque handle. */
const fake = (element: LynxElement): FakeElement => element as unknown as FakeElement

/** The tag of the wrapper's single child, failing loudly if there is not exactly one. */
const tagOfOnlyChild = (wrapper: LynxElement): string => {
  const children = fake(wrapper).children
  const only = children[0]
  if (children.length !== 1 || only === undefined) {
    throw new Error(`expected exactly one child, found ${children.length}`)
  }
  return only.tag
}

/** Installs a fresh engine and hands back the wrapper a swap renders into. */
const setup = (): LynxElement => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  return createWrapper()
}

afterEach(async () => {
  await tick()
  clearEngine()
})

describe('render-child', () => {
  it('builds the selected branch and swaps it when the selection changes', () => {
    const wrapper = setup()
    const left = (): LynxElement => createElement('view')
    const right = (): LynxElement => createElement('image')
    const showLeft = signal(true)

    renderChild(wrapper, () => (showLeft() ? left : right))
    expect(tagOfOnlyChild(wrapper)).toBe('view')

    showLeft(false)

    expect(tagOfOnlyChild(wrapper)).toBe('image')
  })

  it('does not rebuild the branch when the condition changes without changing branch', () => {
    // This is the guarantee the `computed` exists for. A derived condition
    // re-evaluates constantly while staying on one branch — `count() > 5` from 6
    // to 7 — and rebuilding then would tear down a subtree that did not
    // logically change.
    const wrapper = setup()
    const count = signal(6)
    let builds = 0
    let cleanups = 0
    const branch = (): LynxElement => {
      builds++
      onCleanup(() => {
        cleanups++
      })
      return createElement('view')
    }

    renderChild(wrapper, () => (count() > 5 ? branch : null))
    count(7)
    count(8)

    expect(builds).toBe(1)
    expect(cleanups).toBe(0)
  })

  it('tears the outgoing branch down before building the next', () => {
    const wrapper = setup()
    const order: string[] = []
    const first = (): LynxElement => {
      onCleanup(() => order.push('first cleanup'))
      return createElement('view')
    }
    const second = (): LynxElement => {
      order.push('second build')
      return createElement('image')
    }
    const useFirst = signal(true)

    renderChild(wrapper, () => (useFirst() ? first : second))
    useFirst(false)

    expect(order).toEqual(['first cleanup', 'second build'])
  })

  it('renders nothing when the selection is null', () => {
    const wrapper = setup()
    const present = signal(true)

    renderChild(wrapper, () => (present() ? (): LynxElement => createElement('view') : null))
    present(false)

    expect(fake(wrapper).children).toHaveLength(0)
  })

  it('empties the wrapper before the next branch goes in', () => {
    const wrapper = setup()
    const useFirst = signal(true)
    const first = (): LynxElement => createElement('view')
    const second = (): LynxElement => createElement('image')

    renderChild(wrapper, () => (useFirst() ? first : second))
    useFirst(false)

    // One child, not two. The outgoing node has to leave the tree, or the swap
    // is an append.
    expect(fake(wrapper).children.map((child) => child.tag)).toEqual(['image'])
  })

  it('does not subscribe the swap to signals the branch reads while building', () => {
    // The other half of building the branch detached. A component body runs
    // inside the swap effect, so a signal it reads SYNCHRONOUSLY while
    // building — not in one of its own bindings — would be recorded as a
    // dependency of the swap if the build were attached. Writing it would then
    // rebuild the branch and reset every signal the component owns, on a change
    // that selected no new branch at all.
    const wrapper = setup()
    const readInBody = signal('a')
    let builds = 0
    const branch = (): LynxElement => {
      builds++
      readInBody()
      return createElement('view')
    }

    renderChild(wrapper, () => branch)
    expect(builds).toBe(1)

    readInBody('b')

    expect(builds).toBe(1)
  })

  it('keeps the branch own bindings alive across an unrelated selection re-evaluation', () => {
    const wrapper = setup()
    const label = signal('before')
    const count = signal(6)
    const branch = (): LynxElement => {
      const text = createElement('text')
      // A binding inside the branch, of the kind a component would set up.
      renderChild(text, () => (label() === 'before' ? (): LynxElement => createElement('view') : null))
      return text
    }

    renderChild(wrapper, () => (count() > 5 ? branch : null))
    count(7)
    label('after')

    const text = fake(wrapper).children[0] as FakeElement
    expect(text.children).toHaveLength(0)
  })

  it('disposes the mounted branch when torn down', () => {
    const wrapper = setup()
    let cleaned = false
    const branch = (): LynxElement => {
      onCleanup(() => {
        cleaned = true
      })
      return createElement('view')
    }

    const dispose = renderChild(wrapper, () => branch)

    expect(cleaned).toBe(false)
    dispose()
    expect(cleaned).toBe(true)
  })

  it('stops swapping once torn down', () => {
    const wrapper = setup()
    const useFirst = signal(true)
    const first = (): LynxElement => createElement('view')
    const second = (): LynxElement => createElement('image')

    const dispose = renderChild(wrapper, () => (useFirst() ? first : second))
    dispose()
    useFirst(false)

    expect(tagOfOnlyChild(wrapper)).toBe('view')
  })

  it('tearing down twice is harmless', () => {
    const wrapper = setup()
    const dispose = renderChild(wrapper, () => (): LynxElement => createElement('view'))

    dispose()

    expect(() => dispose()).not.toThrow()
  })
})
