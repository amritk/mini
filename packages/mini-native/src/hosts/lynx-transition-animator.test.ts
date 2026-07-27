import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Host } from '../host'
import type { HostElement } from '../types'
import type { LynxElement, LynxElementApi } from './lynx-element-api'
import { createTransitionAnimator } from './lynx-transition-animator'

/**
 * The slice of the engine this animator touches, plus a log of what it was told.
 *
 * Only four of the PAPI's calls are reachable from here, which is itself the
 * point being tested: the animator is built from the declared contract rather
 * than from an engine global somebody hoped was there.
 */
type FakeEngine = {
  api: LynxElementApi
  element: HostElement
  /** Every style write and commit, in order, so a sequence can be asserted as a sequence. */
  log: string[]
  /**
   * The host's "put this element back the way its style prop says" callback,
   * counted rather than reimplemented — what matters here is that it happens
   * exactly once, at the end, however the animation ended.
   */
  release: () => void
  released: () => number
  /** Takes the element out of the tree, as disposing its subtree would. */
  detach: () => void
}

const createFakeEngine = (): FakeEngine => {
  const log: string[] = []
  let parent: LynxElement | null = {} as LynxElement
  let released = 0

  const notCalled = (name: string) => (): never => {
    throw new Error(`the animator should not reach ${name}`)
  }

  const api = {
    __AddInlineStyle: (_element: LynxElement, name: string, value: unknown) => log.push(`${name}: ${String(value)}`),
    __FlushElementTree: () => log.push('commit'),
    __GetParent: () => parent,
    __CreateElement: notCalled('__CreateElement'),
    __SetAttribute: notCalled('__SetAttribute'),
    __GetAttributes: notCalled('__GetAttributes'),
    __SetInlineStyles: notCalled('__SetInlineStyles'),
    __SetClasses: notCalled('__SetClasses'),
    __AppendElement: notCalled('__AppendElement'),
    __InsertElementBefore: notCalled('__InsertElementBefore'),
    __RemoveElement: notCalled('__RemoveElement'),
    __GetChildren: notCalled('__GetChildren'),
    __FirstElement: notCalled('__FirstElement'),
    __NextElement: notCalled('__NextElement'),
    __AddEvent: notCalled('__AddEvent'),
  } as unknown as LynxElementApi

  return {
    api,
    element: {} as HostElement,
    log,
    release: () => {
      released += 1
    },
    released: () => released,
    detach: () => {
      parent = null
    },
  }
}

const animatorFor = (engine: FakeEngine): NonNullable<Host['animate']> =>
  createTransitionAnimator(engine.api, engine.release)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('lynx-transition-animator', () => {
  it('lands the origin without a transition before starting one', async () => {
    const engine = createFakeEngine()
    const running = animatorFor(engine)(engine.element, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 })

    await vi.runAllTimersAsync()

    // The two commits are the load-bearing part. A transition only happens
    // between two committed states, so writing both ends in one commit would
    // make the engine jump straight to the destination — an animation that runs
    // in zero frames and looks like no animation at all.
    expect(engine.log).toEqual([
      'transition: none',
      'opacity: 0',
      'commit',
      'transition: all 200ms ease',
      'opacity: 1',
      'commit',
    ])
    await expect(running.finished).resolves.toBe('finished')
  })

  it('releases the element to its own style when it ends', async () => {
    const engine = createFakeEngine()
    const running = animatorFor(engine)(engine.element, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 })

    await vi.runAllTimersAsync()

    await expect(running.finished).resolves.toBe('finished')
    expect(engine.released()).toBe(1)
  })

  it('adds the unit a bare number implies', async () => {
    const engine = createFakeEngine()
    animatorFor(engine)(engine.element, [{ translateY: 40 }, { translateY: 0 }], { duration: 100 })

    await vi.runAllTimersAsync()

    expect(engine.log).toContain('translateY: 40px')
    expect(engine.log).toContain('translateY: 0px')
  })

  it('waits out the delay before touching the element', async () => {
    const engine = createFakeEngine()
    animatorFor(engine)(engine.element, [{ opacity: 0 }, { opacity: 1 }], { duration: 100, delay: 50 })

    await vi.advanceTimersByTimeAsync(49)
    expect(engine.log).toEqual([])

    await vi.advanceTimersByTimeAsync(1)
    expect(engine.log[0]).toBe('transition: none')
  })

  it('splits the duration across the legs of a multi-keyframe timeline', async () => {
    const engine = createFakeEngine()
    animatorFor(engine)(engine.element, [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 300 })

    await vi.runAllTimersAsync()

    // `duration` means one pass through the whole list, as it does in CSS and in
    // the Web Animations API. Reading it as per-hop would make the same
    // descriptor take twice as long here as it does on the web.
    expect(engine.log.filter((entry) => entry.startsWith('transition: all'))).toEqual([
      'transition: all 150ms ease',
      'transition: all 150ms ease',
    ])
  })

  it('runs the keyframes backwards each odd iteration when alternating', async () => {
    const engine = createFakeEngine()
    animatorFor(engine)(engine.element, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 100,
      iterations: 2,
      direction: 'alternate',
    })

    await vi.runAllTimersAsync()

    expect(engine.log.filter((entry) => entry.startsWith('opacity'))).toEqual([
      'opacity: 0',
      'opacity: 1',
      'opacity: 1',
      'opacity: 0',
    ])
  })

  it('keeps going forever when asked to', async () => {
    const engine = createFakeEngine()
    const spin = animatorFor(engine)(engine.element, [{ rotate: '0deg' }, { rotate: '360deg' }], {
      duration: 100,
      iterations: Number.POSITIVE_INFINITY,
    })

    await vi.advanceTimersByTimeAsync(1000)

    expect(engine.log.filter((entry) => entry === 'commit').length).toBeGreaterThan(10)
    expect(engine.released()).toBe(0)
    spin.cancel()
    await expect(spin.finished).resolves.toBe('cancelled')
  })

  it('stops where it is when cancelled, and releases once', async () => {
    const engine = createFakeEngine()
    const running = animatorFor(engine)(engine.element, [{ opacity: 0 }, { opacity: 1 }], { duration: 400 })

    await vi.advanceTimersByTimeAsync(100)
    running.cancel()
    const afterCancel = engine.log.length
    await vi.advanceTimersByTimeAsync(1000)

    await expect(running.finished).resolves.toBe('cancelled')
    expect(engine.log).toHaveLength(afterCancel)
    expect(engine.released()).toBe(1)
  })

  it('gives up when the element has left the tree', async () => {
    const engine = createFakeEngine()
    const spin = animatorFor(engine)(engine.element, [{ rotate: '0deg' }, { rotate: '360deg' }], {
      duration: 100,
      iterations: Number.POSITIVE_INFINITY,
    })

    await vi.advanceTimersByTimeAsync(100)
    engine.detach()
    await vi.advanceTimersByTimeAsync(1000)

    // Without this an endless animation on a disposed route would keep waking
    // the engine forever, and forgetting to cancel would be a leak rather than
    // an unsettled promise.
    await expect(spin.finished).resolves.toBe('cancelled')
  })

  it('reports finishing an endless animation as a cancellation', async () => {
    const engine = createFakeEngine()
    const spin = animatorFor(engine)(engine.element, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 100,
      iterations: Number.POSITIVE_INFINITY,
    })

    spin.finish()

    await expect(spin.finished).resolves.toBe('cancelled')
  })
})
