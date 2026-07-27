import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, createRawText, insert, setEngine, signal } from '../index'
import { createFakeEngine, type FakeElement } from '../testing/create-fake-engine'
import { buildContainer } from './build-container'
import type { ForProps } from './for'

afterEach(() => {
  clearEngine()
})

/** The in-memory node behind an opaque engine handle. */
const fake = (element: unknown): FakeElement => element as FakeElement

describe('build-container', () => {
  it('builds a wrapper when no `as` is given', () => {
    // The default has to be the engine's grouping element rather than a `view`.
    // A `view` takes part in layout and in the accessibility tree, so a control
    // flow component that inserted one would silently change what the
    // surrounding tree means — a `For` inside a flex row becoming one flex item
    // instead of many.
    const engine = createFakeEngine()
    setEngine(engine.api)

    const container = buildContainer({})

    expect(fake(container).tag).toBe('wrapper')
    // Through the engine's dedicated creator, not `__CreateElement('wrapper')`.
    // The two are not interchangeable on a device: a generic creator builds a
    // plain fiber node that merely carries the tag name.
    expect(engine.calls().some((line) => line.startsWith('__CreateWrapperElement'))).toBe(true)
    expect(engine.calls().some((line) => line.startsWith('__CreateElement'))).toBe(false)
  })

  it('builds the requested element when `as` names one', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    const container = buildContainer({ as: 'scroll-view' })

    expect(fake(container).tag).toBe('scroll-view')
  })

  it('forwards arbitrary Lynx attributes onto the `as` container', () => {
    // The container is a real element and every prop reaches it the way it would
    // on any other element — attributes as attributes, `class` and `id` through
    // their own PAPI calls, styles as declarations. There is no allow-list here,
    // which is what keeps a capability the engine already has from needing a
    // release in this package to become reachable.
    const engine = createFakeEngine()
    setEngine(engine.api)

    const container = buildContainer({
      as: 'scroll-view',
      'scroll-orientation': 'horizontal',
      'enable-scroll': true,
      'accessibility-label': 'rows',
      class: 'list',
      id: 'feed',
      style: { width: 100 },
    })

    const built = fake(container)
    expect(built.attrs).toEqual({
      'scroll-orientation': 'horizontal',
      'enable-scroll': true,
      'accessibility-label': 'rows',
    })
    expect([built.classes, built.elementId, built.styles]).toEqual(['list', 'feed', { width: '100px' }])
  })

  it('binds a getter-valued container prop reactively', () => {
    // A container prop is applied through the same `applyProp` as any other, so
    // the compilerless reactivity rule holds here too: a function tracks.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const horizontal = signal(true)

    const container = buildContainer({
      as: 'scroll-view',
      'scroll-orientation': () => (horizontal() ? 'horizontal' : 'vertical'),
    })

    expect(fake(container).attrs['scroll-orientation']).toBe('horizontal')
    horizontal(false)
    expect(fake(container).attrs['scroll-orientation']).toBe('vertical')
  })

  it('drops each, children and key rather than writing them as attributes', () => {
    // These three belong to the collection component, not to its container.
    // Forwarding them would put junk on the element — visible in a devtool,
    // confusing in a bug report, and in `each`'s case a whole array stringified
    // into an attribute value.
    const engine = createFakeEngine()
    setEngine(engine.api)

    // Typed as `ForProps` because that is literally what arrives: `For` hands
    // its whole props object straight through, so the three extra keys are
    // always present and dropping them is this function's job rather than the
    // caller's.
    const props: ForProps<string, 'view'> = {
      as: 'view',
      each: ['a', 'b'],
      children: (item) => createRawText(item),
      key: (item) => item,
      'accessibility-label': 'rows',
    }
    const container = buildContainer(props)

    expect(fake(container).attrs).toEqual({ 'accessibility-label': 'rows' })
  })

  it('hands the built container to `ref` without writing it as an attribute', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const seen: string[] = []

    const container = buildContainer({ as: 'view', ref: (element) => seen.push(fake(element).tag) })

    expect(seen).toEqual(['view'])
    expect(fake(container).attrs).toEqual({})
  })

  it('does not attach the container anywhere', () => {
    // Placement belongs to whoever asked for the container. `For` returns it and
    // the JSX call site inserts it, so building one must not guess at a parent.
    const engine = createFakeEngine()
    setEngine(engine.api)

    const container = buildContainer({ as: 'view' })

    expect(fake(container).parent).toBeNull()
    insert(engine.pageElement, container, null)
    expect(fake(container).parent).toBe(engine.page)
  })
})
