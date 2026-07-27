import { describe, expect, it } from 'vitest'

import { parseQuery } from './parse-query'

/**
 * The union of both packages' cases. `@amritk/mini` used to reach for
 * `URLSearchParams` here and `@amritk/mini-lynx` could not, so the hand-rolled
 * version is the one that survived — these assertions are what pin it to the
 * behaviour `URLSearchParams` gave the web side, plus the two cases only the
 * native suite covered (a bare key, a malformed escape).
 */
describe('parse-query', () => {
  it('parses a search string with or without its leading question mark', () => {
    expect(parseQuery('?tab=posts&page=2')).toEqual({ tab: 'posts', page: '2' })
    expect(parseQuery('tab=posts')).toEqual({ tab: 'posts' })
  })

  it('returns an empty record for an empty search', () => {
    expect(parseQuery('')).toEqual({})
    expect(parseQuery('?')).toEqual({})
  })

  it('gives a key with no value an empty string', () => {
    expect(parseQuery('?debug')).toEqual({ debug: '' })
  })

  it('keeps the last value when a key repeats', () => {
    // Matching how a form's last field write wins, rather than silently
    // building an array that half the call sites would not expect.
    expect(parseQuery('?p=1&p=2')).toEqual({ p: '2' })
  })

  it('decodes percent-escapes and treats plus as a space', () => {
    expect(parseQuery('?q=a%20b&name=%C3%A9&two=two+words')).toEqual({ q: 'a b', name: 'é', two: 'two words' })
  })

  it('decodes an encoded key, not just its value', () => {
    expect(parseQuery('?a%20b=c')).toEqual({ 'a b': 'c' })
  })

  it('survives a malformed encoding', () => {
    expect(parseQuery('?q=100%')).toEqual({ q: '100%' })
  })
})
