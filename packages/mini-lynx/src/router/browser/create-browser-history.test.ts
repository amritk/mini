// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBrowserHistory } from './create-browser-history'

/**
 * The browser half of routing, driven against happy-dom's History API.
 *
 * What is worth testing here is not `pushState` — that is the platform's job —
 * but the two things this module adds on top of it: the depth stamped into
 * `history.state`, which `RouteStack` reads to tell a push from a replace, and
 * the base prefix, which has to come off on the way in and go back on the way
 * out or route patterns stop meaning what they say.
 */

/** Puts the tab back at a clean root, since happy-dom shares one `window` per file. */
afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('create-browser-history', () => {
  it('reads the current location', () => {
    window.history.replaceState(null, '', '/users/42?tab=posts')
    const history = createBrowserHistory()

    expect(history.location()).toEqual({ path: '/users/42', search: '?tab=posts' })
  })

  it('reports an empty search when there is none', () => {
    window.history.replaceState(null, '', '/users/42')
    expect(createBrowserHistory().location()).toEqual({ path: '/users/42', search: '' })
  })

  it('starts at depth 0 and counts a push', () => {
    const history = createBrowserHistory()
    expect(history.depth()).toBe(0)

    history.push({ path: '/users/1', search: '' })
    expect(history.depth()).toBe(1)
    expect(history.location()).toEqual({ path: '/users/1', search: '' })

    history.push({ path: '/users/1/edit', search: '' })
    expect(history.depth()).toBe(2)
  })

  it('leaves the depth alone on a replace', () => {
    // A replace is a redirect rather than a step. A stack that saw the number
    // move would swap the screen underneath instead of the one on top.
    const history = createBrowserHistory()
    history.push({ path: '/users/1', search: '' })

    history.replace({ path: '/users/2', search: '' })
    expect(history.depth()).toBe(1)
    expect(history.location().path).toBe('/users/2')
  })

  it('carries the query through a push', () => {
    const history = createBrowserHistory()
    history.push({ path: '/search', search: '?q=lynx' })

    expect(history.location()).toEqual({ path: '/search', search: '?q=lynx' })
  })

  it('keeps state the app had already put on the entry', () => {
    window.history.replaceState({ scroll: 120 }, '', '/')
    createBrowserHistory().push({ path: '/next', search: '' })

    expect(window.history.state).toMatchObject({ scroll: 120 })
  })

  it('takes the base off the path it reports', () => {
    window.history.replaceState(null, '', '/app/users/42')
    const history = createBrowserHistory({ base: '/app' })

    // The route table is written `/users/:id`, not `/app/users/:id` — that is
    // the entire point of a base.
    expect(history.location().path).toBe('/users/42')
  })

  it('puts the base back on when it navigates', () => {
    window.history.replaceState(null, '', '/app')
    const history = createBrowserHistory({ base: '/app' })

    history.push({ path: '/users/7', search: '?tab=posts' })
    expect(window.location.pathname).toBe('/app/users/7')
    expect(window.location.search).toBe('?tab=posts')
    expect(history.location().path).toBe('/users/7')
  })

  it('notifies subscribers on popstate, which is where back lands', () => {
    // `back()` is asynchronous in a browser: it returns immediately and the
    // location moves on a later `popstate`. The event is the whole contract.
    const history = createBrowserHistory()
    const listener = vi.fn()
    history.subscribe(listener)

    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops notifying a listener that unsubscribed', () => {
    const history = createBrowserHistory()
    const listener = vi.fn()
    history.subscribe(listener)()

    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(listener).not.toHaveBeenCalled()
  })

  it('leaves no window listener behind once the last subscriber is gone', () => {
    // A router registers its `stop` against the enclosing scope, so a screen
    // that unmounts expects `window` back the way it was found.
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')

    const history = createBrowserHistory()
    const first = history.subscribe(() => {})
    const second = history.subscribe(() => {})
    expect(add).toHaveBeenCalledTimes(1)

    first()
    expect(remove).not.toHaveBeenCalled()
    second()
    expect(remove).toHaveBeenCalledTimes(1)

    add.mockRestore()
    remove.mockRestore()
  })

  it('survives a reload mid-stack, which is what the stamped depth is for', () => {
    // `window.history.length` counts the whole tab and would be wrong here. The
    // depth on the entry is the app's own, and it is still there after a
    // restart — so a stack rebuilt from a bookmarked URL knows where it is.
    createBrowserHistory().push({ path: '/users/1', search: '' })

    const reloaded = createBrowserHistory()
    expect(reloaded.depth()).toBe(1)
  })

  it('treats an entry it did not stamp as the root', () => {
    // An entry pushed by something else in the tab, or one predating the app.
    window.history.replaceState({ somebodyElse: true }, '', '/')
    expect(createBrowserHistory().depth()).toBe(0)
  })
})
