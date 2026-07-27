import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from './engine/current-engine'
import type { LynxElement } from './engine/element-api'
import { createFakeEngine, type FakeElement } from './testing/create-fake-engine'
import { toFactory } from './to-factory'

/**
 * The two branch forms behave differently on purpose, and the difference is the
 * whole reason a caller picks one over the other — so it is worth proving
 * rather than trusting the doc comment.
 */

const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

/** The in-memory node behind an opaque handle. */
const fake = (element: LynxElement): FakeElement => element as unknown as FakeElement

/** Installs a fresh engine and hands back a builder for the branches below. */
const setup = (): ((tag: string) => LynxElement) => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  return (tag) => engine.api.__CreateElement(tag, 0)
}

afterEach(async () => {
  await tick()
  clearEngine()
})

describe('to-factory', () => {
  it('does not build anything until a function branch is entered', () => {
    const create = setup()
    let builds = 0

    const factory = toFactory(() => {
      builds++
      return create('view')
    })

    expect(builds).toBe(0)
    factory()
    expect(builds).toBe(1)
  })

  it('rebuilds a function branch on every entry, so its state resets', () => {
    const create = setup()
    const factory = toFactory(() => create('textarea'))

    const first = factory()
    // Stand-in for whatever state a real branch would hold — a half-typed
    // value, a scroll offset. Re-entering the branch has to lose it.
    fake(first).attrs['value'] = 'half typed'
    const second = factory()

    expect(second).not.toBe(first)
    expect('value' in fake(second).attrs).toBe(false)
  })

  it('reattaches the same node every time in the element form, so state survives', () => {
    // The reason the eager form exists: a branch that is expensive to rebuild,
    // or that holds something worth keeping, is built once and reused.
    const create = setup()
    const built = create('textarea')
    const factory = toFactory(built)

    const first = factory()
    fake(first).attrs['value'] = 'half typed'
    const second = factory()

    expect(second).toBe(built)
    expect(fake(second).attrs['value']).toBe('half typed')
  })

  it('builds the element form eagerly, before the branch is ever entered', () => {
    // The other half of the trade. An already-built element is constructed up
    // front even if the branch never shows, which is exactly what makes it able
    // to keep state across re-entry.
    const create = setup()
    const built = create('view')

    const factory = toFactory(built)

    expect(factory()).toBe(built)
  })
})
