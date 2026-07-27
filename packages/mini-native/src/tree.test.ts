import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from './engine/current-engine'
import type { LynxElement, LynxElementApi } from './engine/element-api'
import { createFakeEngine, type FakeElement, type FakeEngine } from './testing/create-fake-engine'
import { serializeTree } from './testing/serialize-tree'
import {
  clear,
  createElement,
  createRawText,
  createWrapper,
  firstChild,
  insert,
  nextSibling,
  remove,
  setText,
} from './tree'

/**
 * The rules `tree.ts` exists to hold in one place. Every one of them is silent
 * when broken — a move that leaves a node in two places, a mutation that never
 * reaches the screen, a `view` that is not really a view, an element that drops
 * out of selector resolution — so each gets its own case rather than being
 * implied by a tree shape asserted somewhere else.
 */

const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

/**
 * The in-memory node behind an opaque handle.
 *
 * `LynxElement` is branded and empty on purpose, so a test that wants to see
 * what the engine actually holds has to look behind the brand — which is the
 * same arrangement a device engine has on the other side of the boundary.
 */
const fake = (element: LynxElement): FakeElement => element as unknown as FakeElement

/** The tags of an element's children, which is what most ordering assertions want. */
const tagsOf = (element: LynxElement): string[] => fake(element).children.map((child) => child.tag)

/**
 * Wraps a fake engine so a test can see which `parentComponentUniqueId` each
 * creator was handed.
 *
 * The fake's own call log prints that argument as a literal `0`, so the value
 * cannot be read back out of it — and the value is the whole point of these
 * cases. Every wrapper delegates to the fake's ORIGINAL function rather than to
 * its own copy, so one create records one entry.
 */
const watchingOwners = (engine: FakeEngine, owners: number[]): LynxElementApi => ({
  ...engine.api,
  __CreateElement: (tag, owner, info) => {
    owners.push(owner)
    return engine.api.__CreateElement(tag, owner, info)
  },
  __CreateWrapperElement: (owner) => {
    owners.push(owner)
    return engine.api.__CreateWrapperElement(owner)
  },
})

/** The id the fake hands out for its own page, which is what every creator should receive. */
const pageId = (engine: FakeEngine): number => engine.api.__GetElementUniqueID?.(engine.pageElement) ?? -1

afterEach(async () => {
  await tick()
  clearEngine()
})

describe('tree', () => {
  it('creates a tag with no dedicated creator through the generic one', () => {
    // `input`, `textarea`, `svg` and every XElement genuinely have no creator of
    // their own, and `__CreateElement` is exactly what it is for.
    const engine = createFakeEngine()
    setEngine(engine.api)

    createElement('textarea')

    expect(engine.calls()).toEqual([`__CreateElement("textarea", ${pageId(engine)}) → #1`])
  })

  it('creates a tag that has a dedicated creator through that creator', () => {
    // Not a fast path — a correctness requirement. `__CreateElement('view', …)`
    // builds a generic fiber node that is not a view: it loses the layout-only
    // optimisation, a `text` built that way loses text measurement, an `image`
    // loses `src` handling. Nothing errors, the element simply does less.
    const engine = createFakeEngine()
    const created: string[] = []
    setEngine({
      ...engine.api,
      __CreateElement: (tag, owner, info) => {
        created.push(`generic:${tag}`)
        return engine.api.__CreateElement(tag, owner, info)
      },
      __CreateView: (owner) => {
        created.push('fast:view')
        return engine.api.__CreateElement('view', owner, {})
      },
      __CreateText: (owner) => {
        created.push('fast:text')
        return engine.api.__CreateElement('text', owner, {})
      },
    })

    createElement('view')
    createElement('text')
    createElement('textarea')

    expect(created).toEqual(['fast:view', 'fast:text', 'generic:textarea'])
  })

  it('falls back to the generic creator when the engine omits the dedicated one', () => {
    // The creators are optional on the contract only so a fake may leave them
    // out, and this fake does — which is why every other case in this file goes
    // through `__CreateElement`.
    const engine = createFakeEngine()
    setEngine(engine.api)

    createElement('view')

    expect(engine.calls()).toEqual([`__CreateElement("view", ${pageId(engine)}) → #1`])
  })

  it('creates elements with the page unique id rather than zero', () => {
    // Zero looks like a harmless "no owning component" sentinel and is not one:
    // engine ids start well above it, so an element created with zero drops out
    // of class, id and tag selector resolution. The tree renders, inline styles
    // work, and every stylesheet rule quietly misses.
    const engine = createFakeEngine()
    const owners: number[] = []
    setEngine(watchingOwners(engine, owners))

    createElement('textarea')
    createWrapper()

    expect(owners).toEqual([pageId(engine), pageId(engine)])
    expect(owners).not.toContain(0)
  })

  it('hands the dedicated creators the same page unique id', () => {
    const engine = createFakeEngine()
    const owners: number[] = []
    setEngine({
      ...engine.api,
      __CreateView: (owner) => {
        owners.push(owner)
        return engine.api.__CreateElement('view', owner, {})
      },
    })

    createElement('view')

    expect(owners).toEqual([pageId(engine)])
  })

  it('resolves the component id once and reuses it', () => {
    // It cannot change for the life of a page, and the lookup is two engine
    // calls — worth paying once rather than on every element in a list.
    const engine = createFakeEngine()
    let lookups = 0
    setEngine({
      ...engine.api,
      __GetElementUniqueID: (element) => {
        lookups++
        return engine.api.__GetElementUniqueID?.(element) ?? 0
      },
    })

    createElement('textarea')
    createElement('textarea')
    createElement('textarea')

    expect(lookups).toBe(1)
  })

  it('re-resolves the component id when the engine is swapped', () => {
    // The cached id belonged to the outgoing engine's page. Only tests swap
    // engines, but a stale id there would be a baffling failure in the one place
    // that is meant to be easy to reason about.
    const first = createFakeEngine()
    const second = createFakeEngine()
    const owners: number[] = []

    setEngine(watchingOwners(first, owners))
    createElement('textarea')

    setEngine({ ...watchingOwners(second, owners), __GetElementUniqueID: () => 77 })
    createElement('textarea')

    expect(owners).toEqual([pageId(first), 77])
  })

  it('falls back to zero on an engine that reports no ids at all', () => {
    // Harmless there precisely because such an engine has no selector engine for
    // the id to matter to — but it must not throw on the way past.
    const engine = createFakeEngine()
    const owners: number[] = []
    const { __GetElementUniqueID: _unused, ...withoutIds } = watchingOwners(engine, owners)
    setEngine(withoutIds)

    createElement('textarea')

    expect(owners).toEqual([0])
  })

  it('creates a text run through the raw-text creator', () => {
    // A string is an ELEMENT in Lynx and it has its own PAPI call. Building one
    // with `__CreateElement('raw-text')` would produce a node carrying no text.
    const engine = createFakeEngine()
    setEngine(engine.api)

    createRawText('hello')

    expect(engine.calls()).toEqual(['__CreateRawText("hello") → #1'])
  })

  it('updates a text run in place', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const node = createRawText('before')
    insert(engine.pageElement, node, null)

    setText(node, 'after')

    expect(serializeTree(engine.page)).toBe(['<page>', '  <raw-text text="after">'].join('\n'))
  })

  it('creates a wrapper through the wrapper creator', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    createWrapper()

    expect(engine.calls()).toEqual([`__CreateWrapperElement(${pageId(engine)}) → #1`])
  })

  it('appends when the anchor is null', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    insert(engine.pageElement, createElement('view'), null)
    insert(engine.pageElement, createElement('text'), null)

    expect(tagsOf(engine.pageElement)).toEqual(['view', 'text'])
  })

  it('inserts before the anchor when there is one', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const anchor = createElement('view')
    insert(engine.pageElement, anchor, null)

    insert(engine.pageElement, createElement('text'), anchor)

    expect(tagsOf(engine.pageElement)).toEqual(['text', 'view'])
  })

  it('moves an already-parented node rather than leaving it in two places', () => {
    // `list` depends on this — a reordered row is repositioned, never rebuilt —
    // and `__InsertElementBefore` does not detach for you. Left out, a reorder
    // leaves the row in both parents on some engine builds and in neither on
    // others, which is the worst shape of bug to chase.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const from = createElement('view')
    const to = createElement('scroll-view')
    const node = createElement('text')
    insert(engine.pageElement, from, null)
    insert(engine.pageElement, to, null)
    insert(from, node, null)

    engine.clearCalls()
    insert(to, node, null)

    expect(fake(from).children).toHaveLength(0)
    expect(tagsOf(to)).toEqual(['text'])
    // Detach first, then place. The order is the whole guarantee, so it is
    // asserted on the call log rather than inferred from the resulting tree.
    expect(engine.calls().filter((line) => !line.startsWith('__FlushElementTree'))).toEqual([
      `__RemoveElement(#${fake(from).id}, #${fake(node).id})`,
      `__AppendElement(#${fake(to).id}, #${fake(node).id})`,
    ])
  })

  it('reorders a node within its own parent', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const container = createElement('view')
    insert(engine.pageElement, container, null)
    const first = createElement('text')
    const second = createElement('image')
    insert(container, first, null)
    insert(container, second, null)

    insert(container, second, first)

    expect(tagsOf(container)).toEqual(['image', 'text'])
  })

  it('detaches a node from whatever parent it has', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const node = createElement('view')
    insert(engine.pageElement, node, null)

    remove(node)

    expect(engine.page.children).toHaveLength(0)
  })

  it('leaves a node with no parent alone', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const orphan = createElement('view')
    engine.clearCalls()

    remove(orphan)

    expect(engine.calls().some((line) => line.startsWith('__RemoveElement'))).toBe(false)
  })

  it('empties an element of its children', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const container = createElement('view')
    insert(engine.pageElement, container, null)
    for (const tag of ['text', 'image', 'text']) insert(container, createElement(tag), null)

    clear(container)

    expect(fake(container).children).toHaveLength(0)
  })

  it('walks the first child and the next sibling', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const container = createElement('view')
    insert(engine.pageElement, container, null)
    const first = createElement('text')
    const second = createElement('image')
    insert(container, first, null)
    insert(container, second, null)

    expect(firstChild(container)).toBe(first)
    expect(nextSibling(first)).toBe(second)
    expect(nextSibling(second)).toBeNull()
    expect(firstChild(second)).toBeNull()
  })

  it('schedules a commit for every mutation', async () => {
    // A function that mutates without scheduling produces a change that appears
    // only when something else happens to flush afterwards — which looks exactly
    // like a race and is nearly impossible to reproduce on demand. Each mutation
    // gets its own tick, so a missing schedule shows up as a missing flush
    // rather than hiding behind a neighbour's.
    const engine = createFakeEngine()
    setEngine(engine.api)

    const mutations: readonly (() => void)[] = [
      () => createElement('view'),
      () => createRawText('hi'),
      () => createWrapper(),
      () => insert(engine.pageElement, createElement('view'), null),
      () => setText(createRawText('a'), 'b'),
      () => remove(createElement('view')),
      () => clear(engine.pageElement),
    ]

    for (const mutate of mutations) {
      mutate()
      await tick()
    }

    expect(engine.flushes()).toBe(mutations.length)
  })

  it('refuses to touch the tree before an engine is installed', () => {
    expect(() => createElement('view')).toThrow(/No engine installed/)
  })
})
