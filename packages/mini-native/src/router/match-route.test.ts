import { describe, expect, it } from 'vitest'

import { matchRoute } from './match-route'

describe('match-route', () => {
  it('matches a literal path', () => {
    expect(matchRoute('/users', '/users')).toEqual({})
  })

  it('treats a trailing slash as the same route', () => {
    expect(matchRoute('/users', '/users/')).toEqual({})
  })

  it('captures a named segment', () => {
    expect(matchRoute('/users/:id', '/users/42')).toEqual({ id: '42' })
  })

  it('decodes a captured segment', () => {
    expect(matchRoute('/search/:term', '/search/two%20words')).toEqual({ term: 'two words' })
  })

  it('survives a malformed encoding rather than throwing', () => {
    // A user can type anything into an address bar, and a router that throws on
    // a stray `%` takes the whole app down with it.
    expect(matchRoute('/search/:term', '/search/100%')).toEqual({ term: '100%' })
  })

  it('refuses a longer path when there is no wildcard', () => {
    // A longer path is a different, more specific route — matching it here
    // would have `/users/:id` swallow `/users/42/settings`.
    expect(matchRoute('/users/:id', '/users/42/settings')).toBeNull()
  })

  it('refuses a shorter path', () => {
    expect(matchRoute('/users/:id', '/users')).toBeNull()
  })

  it('swallows the rest of the path with a trailing wildcard', () => {
    expect(matchRoute('/docs/*', '/docs/guide/routing')).toEqual({ rest: 'guide/routing' })
  })

  it('reports an empty rest when nothing follows the wildcard', () => {
    expect(matchRoute('/docs/*', '/docs')).toEqual({ rest: '' })
  })

  it('does not match a different literal', () => {
    expect(matchRoute('/users', '/posts')).toBeNull()
  })
})
