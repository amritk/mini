import { describe, expect, it } from 'vitest'

import { parseQuery } from './parse-query'

describe('parse-query', () => {
  it('parses a search string with or without its leading question mark', () => {
    expect(parseQuery('?page=2&sort=name')).toEqual({ page: '2', sort: 'name' })
    expect(parseQuery('page=2')).toEqual({ page: '2' })
  })

  it('yields an empty record for nothing', () => {
    expect(parseQuery('')).toEqual({})
    expect(parseQuery('?')).toEqual({})
  })

  it('gives a key with no value an empty string', () => {
    expect(parseQuery('?debug')).toEqual({ debug: '' })
  })

  it('keeps the last value when a key repeats', () => {
    // Matching how a form's last field write wins, rather than silently
    // building an array that half the call sites would not expect.
    expect(parseQuery('?tag=a&tag=b')).toEqual({ tag: 'b' })
  })

  it('decodes percent-escapes and treats plus as a space', () => {
    expect(parseQuery('?q=two+words&name=%C3%A9')).toEqual({ q: 'two words', name: 'é' })
  })

  it('survives a malformed encoding', () => {
    expect(parseQuery('?q=100%')).toEqual({ q: '100%' })
  })
})
