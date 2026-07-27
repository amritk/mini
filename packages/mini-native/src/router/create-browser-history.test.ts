// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'

import { createBrowserHistory } from './create-browser-history'

/**
 * The one place the router knows what a browser is, which is why it sits on its
 * own entry point and why it needs the happy-dom pragma while every other
 * router suite runs in plain node.
 */
afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('create-browser-history', () => {
  it('reads the current path and query', () => {
    window.history.replaceState(null, '', '/users/1?tab=posts')

    expect(createBrowserHistory().location()).toEqual({ path: '/users/1', search: '?tab=posts' })
  })

  it('strips a base prefix before matching', () => {
    window.history.replaceState(null, '', '/app/users')

    // Route patterns stay written relative to the mount point, so an app can
    // move without its route table changing.
    expect(createBrowserHistory({ base: '/app' }).location().path).toBe('/users')
  })

  it('only strips a base on a path boundary', () => {
    window.history.replaceState(null, '', '/application')

    // `/app` is a coincidental character prefix here, not a real segment.
    expect(createBrowserHistory({ base: '/app' }).location().path).toBe('/application')
  })

  it('writes the URL on a push and counts its own step', () => {
    const history = createBrowserHistory()

    history.push({ path: '/pricing', search: '?plan=pro' })

    expect(window.location.pathname).toBe('/pricing')
    expect(window.location.search).toBe('?plan=pro')
    expect(history.depth()).toBe(1)
  })

  it('counts only the steps this app took', () => {
    const history = createBrowserHistory()

    // `history.length` counts entries from every page the tab has visited, so
    // it cannot answer "would going back leave this app" — which is the only
    // question a back chevron actually asks.
    expect(history.depth()).toBe(0)
    history.push({ path: '/a', search: '' })
    history.push({ path: '/b', search: '' })
    expect(history.depth()).toBe(2)
  })

  it('does not count a replace as a step', () => {
    const history = createBrowserHistory()

    history.replace({ path: '/pricing', search: '' })

    expect(window.location.pathname).toBe('/pricing')
    expect(history.depth()).toBe(0)
  })

  it('puts everything after the hash in hash mode', () => {
    const history = createBrowserHistory({ mode: 'hash' })

    history.push({ path: '/pricing', search: '?plan=pro' })

    // No server configuration needed, which is what makes this the safe mode
    // for static hosting.
    expect(window.location.hash).toBe('#/pricing?plan=pro')
    expect(history.location()).toEqual({ path: '/pricing', search: '?plan=pro' })
  })

  it('reads a root location in hash mode when there is no fragment', () => {
    expect(createBrowserHistory({ mode: 'hash' }).location()).toEqual({ path: '/', search: '' })
  })

  /**
   * Simulates the browser traversing to an entry it had already stored.
   *
   * A real back or forward restores that entry's state BEFORE dispatching the
   * event, which is the whole mechanism the depth is read through — so a test
   * that only fires the event is testing a state the browser never presents.
   */
  const traverseTo = (state: unknown, url: string): void => {
    window.history.replaceState(state, '', url)
    window.dispatchEvent(new Event('popstate'))
  }

  it('tells subscribers about back and forward, and unwinds the count', () => {
    const history = createBrowserHistory()
    let changes = 0
    history.subscribe(() => changes++)

    history.push({ path: '/a', search: '' })
    // Back to the entry the app started on, which carries no stamp of ours.
    traverseTo(null, '/')

    // The browser answers `back()` asynchronously with a popstate, which is why
    // the count moves there rather than in `back` — doing both would take it
    // down twice.
    expect(changes).toBe(1)
    expect(history.depth()).toBe(0)
  })

  it('counts a forward back UP again', () => {
    const history = createBrowserHistory()

    history.push({ path: '/a', search: '' })
    traverseTo(null, '/')
    // Forward, into the entry that was pushed — the case a step counter gets
    // backwards, because it only ever knows how to subtract.
    traverseTo({ __mnDepth: 1 }, '/a')

    expect(history.depth()).toBe(1)
  })

  it('lands on the right depth after a multi-step jump', () => {
    const history = createBrowserHistory()

    history.push({ path: '/a', search: '' })
    history.push({ path: '/a/b', search: '' })
    history.push({ path: '/a/b/c', search: '' })
    expect(history.depth()).toBe(3)

    // Three entries back in one go, which a step counter would read as one.
    traverseTo(null, '/')

    expect(history.depth()).toBe(0)
  })

  it('leaves state the page already stored alone', () => {
    window.history.replaceState({ app: 'kept' }, '', '/')
    const history = createBrowserHistory()

    history.push({ path: '/a', search: '' })

    // `history.state` is shared with whatever else the page does with it, so
    // the depth is stamped alongside rather than over.
    expect(window.history.state).toEqual({ app: 'kept', __mnDepth: 1 })
  })

  it('never counts below the entry point', () => {
    const history = createBrowserHistory()

    // A back that leaves the app entirely never reaches us, so zero is the
    // honest floor rather than a guard against a bug.
    window.dispatchEvent(new Event('popstate'))

    expect(history.depth()).toBe(0)
  })
})
