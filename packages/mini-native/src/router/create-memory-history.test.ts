import { describe, expect, it } from 'vitest'

import { createMemoryHistory } from './create-memory-history'

describe('create-memory-history', () => {
  it('starts where it was told to', () => {
    const history = createMemoryHistory({ path: '/users/1', search: '?tab=posts' })

    expect(history.location()).toEqual({ path: '/users/1', search: '?tab=posts' })
    expect(history.depth()).toBe(0)
  })

  it('stacks a push and unwinds it on back', () => {
    const history = createMemoryHistory()

    history.push({ path: '/a', search: '' })
    history.push({ path: '/b', search: '' })
    expect(history.depth()).toBe(2)

    history.back()

    expect(history.location().path).toBe('/a')
    expect(history.depth()).toBe(1)
  })

  it('takes the place of the current entry on replace', () => {
    const history = createMemoryHistory()

    history.push({ path: '/a', search: '' })
    history.replace({ path: '/b', search: '' })
    history.back()

    // A redirect rather than a step: going back reaches what preceded the thing
    // that was replaced, not the thing itself.
    expect(history.location().path).toBe('/')
  })

  it('does nothing when there is nowhere to go back to', () => {
    const history = createMemoryHistory()

    // An ordinary thing for a user to try at the first screen, and on a device
    // the platform — not this stack — decides what happens next.
    expect(() => history.back()).not.toThrow()
    expect(history.location().path).toBe('/')
    expect(history.depth()).toBe(0)
  })

  it('tells subscribers about a back that came from outside', () => {
    const history = createMemoryHistory()
    let changes = 0
    history.subscribe(() => changes++)

    history.push({ path: '/a', search: '' })
    // A push goes through the router, which already knows to refresh; a back
    // can also come from a hardware gesture, which is what this is for.
    expect(changes).toBe(0)

    history.back()

    expect(changes).toBe(1)
  })

  it('stops telling a subscriber that unsubscribed', () => {
    const history = createMemoryHistory()
    let changes = 0
    const stop = history.subscribe(() => changes++)

    history.push({ path: '/a', search: '' })
    stop()
    history.back()

    expect(changes).toBe(0)
  })
})
