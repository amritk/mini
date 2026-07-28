import { afterEach, describe, expect, it } from 'vitest'

import { appendChildren } from '../append-children'
import { clearEngine, setEngine } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { effect } from '../signals'
import { createFakeEngine } from '../testing/create-fake-engine'
import { createElement } from '../tree'
import { createMemoryHistory } from './create-memory-history'
import { createRouter, type Route } from './create-router'

afterEach(() => {
  clearEngine()
})

/** A `<text>` holding one run — enough of a screen for the matching to be about matching. */
const screen = (value: string): LynxElement => {
  const element = createElement('text')
  appendChildren(element, value)
  return element
}

const routes: Route[] = [
  { path: '/', view: () => screen('home') },
  { path: '/users/:id', view: (params) => screen(`user ${params()['id']}`) },
  { path: '/docs/*', view: (params) => screen(`docs ${params()['rest']}`) },
]

describe('create-router', () => {
  it('matches the current location on creation', () => {
    const router = createRouter({ routes, history: createMemoryHistory({ path: '/users/7', search: '' }) })

    expect(router.route().params).toEqual({ id: '7' })
    expect(router.route().route?.path).toBe('/users/:id')
  })

  it('reports no route rather than throwing when nothing matched', () => {
    const router = createRouter({ routes, history: createMemoryHistory({ path: '/nope', search: '' }) })

    // A 404 is an ordinary state for a router to be in — the app decides what
    // to render, and it cannot decide anything if the router threw.
    expect(router.route().route).toBeNull()
  })

  it('parses the query alongside the params', () => {
    const router = createRouter({ routes, history: createMemoryHistory({ path: '/', search: '?page=2' }) })

    expect(router.route().query).toEqual({ page: '2' })
  })

  it('updates the route signal on navigation', () => {
    const router = createRouter({ routes, history: createMemoryHistory() })

    router.navigate('/users/9?tab=posts')

    expect(router.route().params).toEqual({ id: '9' })
    expect(router.route().query).toEqual({ tab: 'posts' })
  })

  it('goes back to where it came from', () => {
    const router = createRouter({ routes, history: createMemoryHistory() })

    router.navigate('/users/1')
    router.back()

    expect(router.route().path).toBe('/')
  })

  it('does not stack an entry for a replace', () => {
    const router = createRouter({ routes, history: createMemoryHistory() })

    router.navigate('/users/1')
    router.navigate('/users/2', { replace: true })
    router.back()

    // A replace is a redirect rather than a step, so going back reaches what
    // preceded the thing that was replaced.
    expect(router.route().path).toBe('/')
  })

  it('says whether there is anywhere to go back to', () => {
    const router = createRouter({ routes, history: createMemoryHistory() })
    expect(router.canGoBack()).toBe(false)

    router.navigate('/users/1')
    expect(router.canGoBack()).toBe(true)

    router.back()
    expect(router.canGoBack()).toBe(false)
  })

  it('follows a change that came from outside', () => {
    const history = createMemoryHistory()
    const router = createRouter({ routes, history })
    router.navigate('/users/1')

    // A hardware back gesture calls the history directly rather than going
    // through the router, which is exactly the case `subscribe` exists for.
    history.back()

    expect(router.route().path).toBe('/')
  })

  it('builds a screen with no engine involved at all', () => {
    // Worth pinning: the router itself never touches the element tree, which is
    // why every case above runs without an engine installed. Only `RouteView`
    // does, and that is a separate file for exactly this reason.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory({ path: '/docs/a/b', search: '' }) })

    expect(router.route().params).toEqual({ rest: 'a/b' })
    expect(engine.calls()).toEqual([])
  })
  it('reports the depth a push added and a replace did not', () => {
    const router = createRouter({ routes, history: createMemoryHistory() })
    expect(router.depth()).toBe(0)

    router.navigate('/users/1')
    expect(router.depth()).toBe(1)

    // The distinction a stack is built on, and the one the matched route
    // cannot make: same route, same params shape, different number of screens.
    router.navigate('/users/2', { replace: true })
    expect(router.depth()).toBe(1)

    router.back()
    expect(router.depth()).toBe(0)
  })

  it('announces a navigation once, not once per way it was told', () => {
    const router = createRouter({ routes, history: createMemoryHistory() })
    let announced = 0
    const stop = effect(() => {
      router.route()
      announced++
    })
    announced = 0

    // `back` reaches the refresh twice — an in-memory history notifies because
    // a hardware gesture calls it from outside, and the router refreshes
    // because a browser would answer asynchronously. One navigation is still
    // one change, and anything mid-transition depends on it.
    router.navigate('/users/1')
    router.back()

    expect(announced).toBe(2)
    stop()
  })
})
