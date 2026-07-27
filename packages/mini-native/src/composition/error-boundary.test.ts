import { afterEach, describe, expect, it } from 'vitest'

import { addEvent } from '../add-event'
import { appendChildren } from '../append-children'
import { clearEngine, setEngine } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { mount } from '../mount'
import { onCleanup } from '../on-cleanup'
import { signal } from '../signals'
import { createFakeEngine, type FakeEngine } from '../testing/create-fake-engine'
import { serializeTree } from '../testing/serialize-tree'
import { createElement } from '../tree'
import { createContext } from './create-context'
import { ErrorBoundary } from './error-boundary'

afterEach(() => {
  clearEngine()
})

/** A `<text>` holding one run — the smallest thing a boundary can render. */
const text = (value: string): LynxElement => {
  const element = createElement('text')
  appendChildren(element, value)
  return element
}

/** A `<text>` that runs `onTap` when tapped, which is how a fallback offers a retry. */
const tappable = (value: string, onTap: () => void): LynxElement => {
  const element = text(value)
  addEvent(element, 'bindEvent', 'tap', onTap)
  return element
}

/** Fires the `retry` the fallback wired to its tap handler. */
const retry = (engine: FakeEngine): void => {
  const fallback = engine.find('text')
  if (!fallback) throw new Error('expected a fallback element to tap')
  engine.dispatch(fallback, 'tap')
}

describe('error-boundary', () => {
  it('renders the children when nothing goes wrong', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () => ErrorBoundary({ fallback: () => text('failed'), children: () => text('fine') }))

    expect(serializeTree(engine.page)).toContain('"fine"')
  })

  it('renders the fallback when building the children throws', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () =>
      ErrorBoundary({
        fallback: (error) => text(String(error)),
        children: () => {
          throw new Error('boom')
        },
      }),
    )

    // A component runs exactly once, so a throw part-way through leaves a
    // half-built tree with no second render to recover on. On a device that is
    // a dead app rather than a blank area.
    expect(serializeTree(engine.page)).toContain('"Error: boom"')
  })

  it('renders into a wrapper, so the boundary is invisible to the tree it guards', () => {
    // A boundary owns a slot the same way control flow does, and a real
    // container view in that slot would sit between a list and its items.
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () => ErrorBoundary({ fallback: () => text('failed'), children: () => text('fine') }))

    expect(engine.find('wrapper')).toBeDefined()
  })

  it('rebuilds from scratch on retry', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const broken = signal(true)

    mount(engine.pageElement, () =>
      ErrorBoundary({
        fallback: (_error, again) => tappable('failed', again),
        children: () => {
          if (broken()) throw new Error('boom')
          return text('recovered')
        },
      }),
    )
    expect(serializeTree(engine.page)).toContain('"failed"')

    broken(false)
    retry(engine)

    expect(serializeTree(engine.page)).toContain('"recovered"')
  })

  it('tears the failed attempt down before retrying', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const disposed: string[] = []
    const broken = signal(true)

    mount(engine.pageElement, () =>
      ErrorBoundary({
        fallback: (_error, again) => tappable('failed', again),
        children: () => {
          onCleanup(() => disposed.push('attempt'))
          if (broken()) throw new Error('boom')
          return text('recovered')
        },
      }),
    )

    broken(false)
    retry(engine)

    // Whatever the failed attempt managed to register before it threw belongs
    // to that attempt, so a retry has to take it with it — otherwise every
    // retry leaks the bindings of the one before.
    expect(disposed).toEqual(['attempt'])
  })

  it('leaves nothing of the failed attempt in the tree', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const broken = signal(true)

    mount(engine.pageElement, () =>
      ErrorBoundary({
        fallback: (_error, again) => tappable('failed', again),
        children: () => {
          if (broken()) throw new Error('boom')
          return text('recovered')
        },
      }),
    )

    broken(false)
    retry(engine)

    expect(serializeTree(engine.page)).not.toContain('"failed"')
  })

  it('still sees the context it was written inside after a retry', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const Theme = createContext('light')
    const broken = signal(true)

    mount(engine.pageElement, () =>
      Theme.provide('dark', () =>
        ErrorBoundary({
          fallback: (_error, again) => tappable('failed', again),
          children: () => {
            if (broken()) throw new Error('boom')
            return text(Theme.use())
          },
        }),
      ),
    )

    broken(false)
    retry(engine)

    // A retry happens long after `provide` returned, so the boundary has to
    // carry the frame the same way a conditional does.
    expect(serializeTree(engine.page)).toContain('"dark"')
  })

  it('disposes the last attempt when the mount goes away', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const disposed: string[] = []

    const dispose = mount(engine.pageElement, () =>
      ErrorBoundary({
        fallback: () => text('failed'),
        children: () => {
          onCleanup(() => disposed.push('attempt'))
          return text('fine')
        },
      }),
    )

    dispose()

    // The attempt's scope is built detached, so the enclosing scope has to be
    // told about it explicitly or an unmounted screen keeps reacting.
    expect(disposed).toEqual(['attempt'])
  })
})
