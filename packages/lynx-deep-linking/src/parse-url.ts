import { parseQuery } from '@amritk/mini-helpers'

import type { ParsedURL } from './types'

/** `scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )`, straight from RFC 3986. */
const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/

/**
 * Takes an incoming URL apart into the pieces a router needs.
 *
 * Written by hand rather than through `URL`, and that is not reinvention:
 * `URL` is a web platform global, not an ECMAScript one. It is absent from the
 * `lib: ["ESNext"]` this package compiles against and a native engine is under
 * no obligation to provide it — the same reasoning `@amritk/mini-helpers`
 * gives for hand-writing `parseQuery`, which this delegates the query to.
 *
 * ## The first segment is the host, and this is the bug everyone ships
 *
 * `myapp://profile/42` parses as host `profile`, path `/42`. Not path
 * `/profile/42`. A `//` opens an authority component and the grammar does not
 * care that a custom scheme has no such thing as a host, so the segment that
 * looks like the start of a route is parsed as one. Every URL parser on every
 * platform agrees on this and every deep-link integration meets it once.
 *
 * Two ways out, and picking one deliberately is the whole point of knowing:
 *
 * ```ts
 * // 1. Give the URL an authority, so the path is the path.
 * //    myapp://app/profile/42  →  host 'app', path '/profile/42'
 *
 * // 2. Or route on both, which is what an existing scheme forces.
 * const { host, path } = parseURL(url)
 * const route = `/${[host, path.replace(/^\//, '')].filter(Boolean).join('/')}`
 * ```
 *
 * ## What it does and does not decode
 *
 * `query` and `fragment` come back decoded, because they are values. `path`
 * stays percent-encoded, because it is not one: decoding it whole would turn an
 * encoded `%2F` inside a segment into a separator and change how many segments
 * there are. Decode per segment — `matchRoute` from `@amritk/mini-helpers`
 * already does, so `matchRoute('/order/:id', parseURL(url).path)` composes
 * without any of this mattering.
 *
 * Nothing here throws. A string that is not a URL comes back as `scheme: null`
 * with the whole thing in `path`, because an app cannot do anything useful with
 * an exception raised by a link a stranger sent its user.
 *
 * @example
 * ```ts
 * parseURL('myapp://order/42?ref=email#top')
 * // { scheme: 'myapp', host: 'order', path: '/42', query: { ref: 'email' }, fragment: 'top' }
 *
 * parseURL('https://example.com/a/b')
 * // { scheme: 'https', host: 'example.com', path: '/a/b', query: {}, fragment: null }
 * ```
 */
export const parseURL = (url: string): ParsedURL => {
  const hashAt = url.indexOf('#')
  const fragment = hashAt === -1 ? null : decode(url.slice(hashAt + 1))
  const beforeFragment = hashAt === -1 ? url : url.slice(0, hashAt)

  const queryAt = beforeFragment.indexOf('?')
  const query = parseQuery(queryAt === -1 ? '' : beforeFragment.slice(queryAt + 1))
  const beforeQuery = queryAt === -1 ? beforeFragment : beforeFragment.slice(0, queryAt)

  const matched = SCHEME.exec(beforeQuery)
  // Lowercased because schemes are case-insensitive and comparing them is the
  // only thing anyone does with this field. The host is deliberately left
  // alone: for a custom scheme it is a route segment wearing a host's clothes,
  // and `myapp://Profile` is not `myapp://profile` to the code that reads it.
  const scheme = matched ? (matched[1] as string).toLowerCase() : null
  const afterScheme = matched ? beforeQuery.slice((matched[0] as string).length) : beforeQuery

  // No `//` means no authority: `mailto:a@b.com` and a bare `/settings` both
  // land here, and both have their whole remainder as the path.
  if (!afterScheme.startsWith('//')) return { scheme, host: null, path: afterScheme, query, fragment }

  const authority = afterScheme.slice(2)
  const slashAt = authority.indexOf('/')
  const host = slashAt === -1 ? authority : authority.slice(0, slashAt)
  const path = slashAt === -1 ? '' : authority.slice(slashAt)

  // An empty authority (`myapp:///settings`) is a host nobody wrote, so it
  // reports as absent rather than as the empty string — one falsy shape to
  // check instead of two.
  return { scheme, host: host === '' ? null : host, path, query, fragment }
}

/** Decodes one component, tolerating a malformed encoding rather than throwing. */
const decode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
