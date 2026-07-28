import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearEngine, effect, mount, reducedMotion, setEngine, setReducedMotion } from './index'
import { createMemoryHistory } from './router/create-memory-history'
import { createRouter, type Route } from './router/create-router'
import { RouteStack } from './router/route-stack'
import { createFakeEngine } from './testing/create-fake-engine'

afterEach(() => {
  setReducedMotion(false)
  clearEngine()
})

const routes: Route[] = [
  { path: '/', view: () => <text>home</text> },
  { path: '/settings', view: () => <text>settings</text> },
]

describe('reducedMotion', () => {
  it('defaults to false, so an app that never states it animates', () => {
    // A runtime that guessed would be wrong silently in the direction that
    // hurts. The app behaves exactly as it did before this existed.
    expect(reducedMotion()).toBe(false)
  })

  it('tracks, so a preference toggled while the app is open is seen', () => {
    const seen: boolean[] = []
    // A block body, not an expression: alien-signals treats an effect's return
    // value as its cleanup, and `push` returns a number.
    const stop = effect(() => {
      seen.push(reducedMotion())
    })

    setReducedMotion(true)
    setReducedMotion(false)
    stop()

    // The preference can change under a running app, so a one-shot read at
    // startup would be wrong for the rest of the session.
    expect(seen).toEqual([false, true, false])
  })
})

describe('RouteStack honouring the preference', () => {
  const stack = (transition: () => void) => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })
    mount(engine.pageElement, () => <RouteStack router={router} transition={transition} />)
    return router
  }

  it('skips the transition entirely when the preference is set', () => {
    const transition = vi.fn()
    const router = stack(transition)

    setReducedMotion(true)
    router.navigate('/settings')

    // Honoured above the seam, so it covers a transition this package never
    // saw — which is the point of it not being each transition's job.
    expect(transition).not.toHaveBeenCalled()
  })

  it('runs the transition when the preference is not set', () => {
    const transition = vi.fn()
    const router = stack(transition)

    router.navigate('/settings')

    expect(transition).toHaveBeenCalledTimes(1)
  })

  it('settles the stack when the transition is skipped', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })
    mount(engine.pageElement, () => <RouteStack router={router} transition={() => new Promise(() => {})} />)

    setReducedMotion(true)
    router.navigate('/settings')

    // The transition above never resolves. Skipping has to take the instant
    // path rather than waiting on it, or a reduced-motion app is a stuck one.
    const cards = engine.page.children[0]?.children ?? []
    expect(cards).toHaveLength(2)
    expect(cards[0]?.styles['display']).toBe('none')
  })
})
