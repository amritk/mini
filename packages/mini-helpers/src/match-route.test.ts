import { describe, expect, it } from 'vitest'

import { matchRoute } from './match-route'

/**
 * The union of what both routers used to assert separately. Neither package
 * lost a case in the move, and every case now covers both of them at once —
 * which is the point of the file living here.
 */
describe('match-route', () => {
  it('matches a literal path with no params', () => {
    expect(matchRoute('/about', '/about')).toEqual({})
  })

  it('returns null when a literal segment differs', () => {
    expect(matchRoute('/about', '/contact')).toBeNull()
  })

  it('matches the root path', () => {
    expect(matchRoute('/', '/')).toEqual({})
  })

  it('treats leading and trailing slashes as equivalent', () => {
    expect(matchRoute('/about/', '/about')).toEqual({})
    expect(matchRoute('about', '/about/')).toEqual({})
  })

  it('captures a named param', () => {
    expect(matchRoute('/users/:id', '/users/42')).toEqual({ id: '42' })
  })

  it('captures several params across segments', () => {
    expect(matchRoute('/users/:id/posts/:postId', '/users/7/posts/9')).toEqual({ id: '7', postId: '9' })
  })

  it('decodes percent-encoded segments', () => {
    expect(matchRoute('/search/:q', '/search/hello%20world')).toEqual({ q: 'hello world' })
  })

  it('survives a malformed encoding rather than throwing', () => {
    // A user can type anything into an address bar, and a router that throws on
    // a stray `%` takes the whole app down with it.
    expect(matchRoute('/search/:q', '/search/100%')).toEqual({ q: '100%' })
  })

  it('does not match when the path is longer than the pattern', () => {
    // A longer path is a different, more specific route — matching it here
    // would have `/users/:id` swallow `/users/42/settings`.
    expect(matchRoute('/users/:id', '/users/7/extra')).toBeNull()
  })

  it('does not match when the path is shorter than the pattern', () => {
    expect(matchRoute('/users/:id', '/users')).toBeNull()
  })

  it('captures the remainder into rest with a trailing wildcard', () => {
    expect(matchRoute('/files/*', '/files/a/b/c')).toEqual({ rest: 'a/b/c' })
  })

  it('matches an empty rest when nothing follows the wildcard', () => {
    expect(matchRoute('/files/*', '/files')).toEqual({ rest: '' })
  })

  it('combines named params with a trailing wildcard', () => {
    expect(matchRoute('/u/:id/*', '/u/3/settings/profile')).toEqual({ id: '3', rest: 'settings/profile' })
  })
})
