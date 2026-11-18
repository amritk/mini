import { describe, expect, it } from 'vitest'

import { buildPath } from './build-path'
import { matchRoute } from './match-route'

describe('build-path', () => {
  it('fills a named param', () => {
    expect(buildPath('/users/:id', { id: '42' })).toBe('/users/42')
  })

  it('fills several params across segments', () => {
    expect(buildPath('/users/:id/posts/:postId', { id: '7', postId: '9' })).toBe('/users/7/posts/9')
  })

  it('returns a literal pattern unchanged', () => {
    expect(buildPath('/about', {})).toBe('/about')
    expect(buildPath('/', {})).toBe('/')
  })

  it('normalises leading and trailing slashes, as the matcher does', () => {
    expect(buildPath('users/:id/', { id: '1' })).toBe('/users/1')
  })

  it('encodes a value so it stays one segment', () => {
    expect(buildPath('/search/:q', { q: 'hello world' })).toBe('/search/hello%20world')
    expect(buildPath('/search/:q', { q: 'a/b' })).toBe('/search/a%2Fb')
  })

  it('keeps the slashes in a wildcard structural', () => {
    // `rest` IS a path, so its separators survive while everything around them
    // is encoded — the same reading `matchRoute` takes when it joins the tail.
    expect(buildPath('/files/*', { rest: 'docs/a b.txt' })).toBe('/files/docs/a%20b.txt')
  })

  it('drops an empty wildcard rather than leaving a trailing slash', () => {
    expect(buildPath('/files/*', { rest: '' })).toBe('/files')
  })

  it('round-trips through matchRoute', () => {
    // The property that makes the pair worth having: anything built here is
    // matched back to the values it was built from, encoding included.
    const params = { id: 'a b/c', postId: '100%' }
    const path = buildPath('/users/:id/posts/:postId', params)
    expect(matchRoute('/users/:id/posts/:postId', path)).toEqual(params)
  })

  it('round-trips a wildcard through matchRoute', () => {
    const path = buildPath('/files/*', { rest: 'docs/a b.txt' })
    expect(matchRoute('/files/*', path)).toEqual({ rest: 'docs/a b.txt' })
  })
})
