import { describe, expect, it } from 'vitest'

import { createURL } from './create-url'
import { parseURL } from './parse-url'

/**
 * The two pure halves of the package: no bridge, no native module, no
 * platform. They are here because a link is a string long before it is an
 * event, and every routing decision an app makes is made on these.
 *
 * The cases that matter are the ones nobody expects — the authority rule, and
 * what is decoded and what is not — so those are pinned hardest.
 */

describe('parseURL', () => {
  it('takes a custom-scheme URL apart', () => {
    expect(parseURL('myapp://order/42?ref=email#top')).toEqual({
      scheme: 'myapp',
      host: 'order',
      path: '/42',
      query: { ref: 'email' },
      fragment: 'top',
    })
  })

  it('reads the first segment of a custom-scheme URL as the host', () => {
    // The rule every deep-link integration meets once: `//` opens an authority
    // and the grammar does not care that a custom scheme has no host. Changing
    // this to "helpfully" report `/profile/42` would make this parser disagree
    // with every other one on both platforms.
    const parsed = parseURL('myapp://profile/42')
    expect(parsed.host).toBe('profile')
    expect(parsed.path).toBe('/42')
  })

  it('reads a full path when the URL has a real authority', () => {
    expect(parseURL('https://example.com/a/b')).toEqual({
      scheme: 'https',
      host: 'example.com',
      path: '/a/b',
      query: {},
      fragment: null,
    })
  })

  it('reports an empty authority as no host', () => {
    const parsed = parseURL('myapp:///settings')
    expect(parsed.host).toBeNull()
    expect(parsed.path).toBe('/settings')
  })

  it('handles a scheme with no authority at all', () => {
    expect(parseURL('mailto:support@example.com')).toEqual({
      scheme: 'mailto',
      host: null,
      path: 'support@example.com',
      query: {},
      fragment: null,
    })
  })

  it('lowercases the scheme and leaves the host alone', () => {
    const parsed = parseURL('MyApp://Profile/42')
    expect(parsed.scheme).toBe('myapp')
    // A custom scheme's "host" is a route segment wearing a host's clothes, and
    // lowercasing it would silently change which route it names.
    expect(parsed.host).toBe('Profile')
  })

  it('decodes the query and the fragment but not the path', () => {
    const parsed = parseURL('myapp://a/b%20c?q=a%20b%26c#a%20b')
    // The path stays encoded because decoding it whole would turn an encoded
    // separator into a real one and change how many segments there are;
    // `matchRoute` decodes per segment, which is the level that is safe.
    expect(parsed.path).toBe('/b%20c')
    expect(parsed.query).toEqual({ q: 'a b&c' })
    expect(parsed.fragment).toBe('a b')
  })

  it('keeps the last value of a repeated query key', () => {
    expect(parseURL('myapp://a?x=1&x=2').query).toEqual({ x: '2' })
  })

  it('reports a string that is not a URL rather than throwing', () => {
    // A link arrives from outside the app, so a malformed one is input, not a
    // bug — an app cannot do anything useful with an exception here.
    expect(parseURL('not a url')).toEqual({
      scheme: null,
      host: null,
      path: 'not a url',
      query: {},
      fragment: null,
    })
  })

  it('tolerates a malformed percent-encoding', () => {
    expect(parseURL('myapp://a?q=%E0%A4%A').query).toEqual({ q: '%E0%A4%A' })
  })
})

describe('createURL', () => {
  it('builds the shape an OAuth redirect URI wants', () => {
    expect(createURL('myapp', 'auth/callback')).toBe('myapp://auth/callback')
  })

  it('percent-encodes the query, separators included', () => {
    // The one job hand-rolled concatenation gets wrong: an unencoded `&` in a
    // state token is a link that silently loses half of itself.
    expect(createURL('myapp', 'auth/callback', { query: { state: 'a b&c' } })).toBe(
      'myapp://auth/callback?state=a%20b%26c',
    )
  })

  it('encodes path segments without eating the separators', () => {
    expect(createURL('myapp', 'order/a b/c')).toBe('myapp://order/a%20b/c')
  })

  it('puts a host before the path when one is given', () => {
    expect(createURL('myapp', 'profile/42', { host: 'app' })).toBe('myapp://app/profile/42')
  })

  it('builds a bare scheme URL', () => {
    expect(createURL('myapp')).toBe('myapp://')
  })

  it('appends an encoded fragment', () => {
    expect(createURL('myapp', 'a', { fragment: 'a b' })).toBe('myapp://a#a%20b')
  })

  it('round-trips through parseURL', () => {
    const url = createURL('myapp', 'auth/callback', { host: 'app', query: { code: 'x y' } })
    const parsed = parseURL(url)

    expect(parsed.scheme).toBe('myapp')
    expect(parsed.host).toBe('app')
    expect(parsed.path).toBe('/auth/callback')
    expect(parsed.query).toEqual({ code: 'x y' })
  })
})
