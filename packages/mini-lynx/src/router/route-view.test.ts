import { afterEach, describe, expect, it } from 'vitest'

import { appendChildren } from '../append-children'
import { clearEngine, setEngine } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { mount } from '../mount'
import { createFakeEngine } from '../testing/create-fake-engine'
import { serializeTree } from '../testing/serialize-tree'
import { createElement } from '../tree'
import { createMemoryHistory } from './create-memory-history'
import { createRouter, type Route } from './create-router'
import { RouteView } from './route-view'

afterEach(() => {
  clearEngine()
})

/** A `<text>` holding one run, static or reactive. */
const screen = (value: string | (() => string)): LynxElement => {
  const element = createElement('text')
  appendChildren(element, value)
  return element
}

const routes: Route[] = [
  { path: '/', view: () => screen('home') },
  { path: '/users/:id', view: (params) => screen(() => `user ${params()['id']}`) },
]

describe('route-view', () => {
  it('renders the matched route and swaps when it changes', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => RouteView({ router, fallback: () => screen('missing') }))
    expect(serializeTree(engine.page)).toContain('"home"')

    router.navigate('/users/3')

    expect(serializeTree(engine.page)).toContain('"user 3"')
  })

  it('keeps the screen when only the params changed', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    let built = 0
    const counted: Route[] = [
      {
        path: '/users/:id',
        view: (params) => {
          built++
          return screen(() => `user ${params()['id']}`)
        },
      },
    ]
    const router = createRouter({ routes: counted, history: createMemoryHistory({ path: '/users/1', search: '' }) })

    mount(engine.pageElement, () => RouteView({ router }))
    router.navigate('/users/2')

    // Same route, new params. Rebuilding would throw away scroll position, a
    // focused field, and anything in flight inside the screen — for a change
    // the params getter reports on its own.
    expect(built).toBe(1)
    expect(serializeTree(engine.page)).toContain('"user 2"')
  })

  it('renders the fallback when nothing matches', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory({ path: '/nope', search: '' }) })

    mount(engine.pageElement, () => RouteView({ router, fallback: () => screen('missing') }))

    expect(serializeTree(engine.page)).toContain('"missing"')
  })

  it('renders nothing when nothing matches and there is no fallback', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory({ path: '/nope', search: '' }) })

    mount(engine.pageElement, () => RouteView({ router }))

    expect(engine.find('wrapper')?.children).toEqual([])
  })

  it('renders into a wrapper, so nothing sits between the screen and its parent', () => {
    // A real container view in the router's slot would break every
    // parent/child relationship assistive technology walks through it.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => RouteView({ router }))

    expect(engine.page.children[0]?.tag).toBe('wrapper')
  })
})
