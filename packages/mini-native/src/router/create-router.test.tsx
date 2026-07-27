import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, setHost } from '../index'
import { createMemoryHistory } from './create-memory-history'
import { createRouter, type Route } from './create-router'
import { RouteView } from './route-view'

afterEach(() => {
  clearHost()
})

const routes: Route[] = [
  { path: '/', view: () => <text>home</text> },
  { path: '/users/:id', view: (params) => <text>{() => `user ${params()['id']}`}</text> },
  { path: '/docs/*', view: (params) => <text>{() => `docs ${params()['rest']}`}</text> },
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

  it('renders the matched route and swaps when it changes', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(memory.rootElement, () => <RouteView router={router} fallback={() => <text>missing</text>} />)
    expect(serializeMemoryTree(memory.root)).toContain('"home"')

    router.navigate('/users/3')

    expect(serializeMemoryTree(memory.root)).toContain('"user 3"')
  })

  it('keeps the screen when only the params changed', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    let built = 0
    const counted: Route[] = [
      {
        path: '/users/:id',
        view: (params) => {
          built++
          return <text>{() => `user ${params()['id']}`}</text>
        },
      },
    ]
    const router = createRouter({ routes: counted, history: createMemoryHistory({ path: '/users/1', search: '' }) })

    mount(memory.rootElement, () => <RouteView router={router} />)
    router.navigate('/users/2')

    // Same route, new params. Rebuilding would throw away scroll position, a
    // focused field, and anything in flight inside the screen — for a change
    // the params getter reports on its own.
    expect(built).toBe(1)
    expect(serializeMemoryTree(memory.root)).toContain('"user 2"')
  })

  it('renders the fallback when nothing matches', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const router = createRouter({ routes, history: createMemoryHistory({ path: '/nope', search: '' }) })

    mount(memory.rootElement, () => <RouteView router={router} fallback={() => <text>missing</text>} />)

    expect(serializeMemoryTree(memory.root)).toContain('"missing"')
  })
})
