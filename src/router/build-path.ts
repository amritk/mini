import type { RouteParams } from './match-route'
import type { PathParams } from './path-params'

/**
 * Fills a route pattern in with concrete params — the inverse of
 * {@link matchRoute}, and the typed way to build somewhere to navigate to.
 *
 * `navigate` takes a string because a concrete path is what a router navigates
 * to, and a path that matches nothing is a legitimate thing to ask for: that is
 * what a not-found screen is. So the check that is worth having is not on
 * `navigate` but here, one step earlier, on the place the string is assembled.
 * `buildPath('/users/:id', { id })` cannot spell the pattern wrong, cannot
 * forget a param, and cannot be left behind when a route is renamed.
 *
 * ```ts
 * buildPath('/users/:id', { id: '42' })            // '/users/42'
 * buildPath('/users/:id/posts/:post', { … })       // '/users/7/posts/9'
 * buildPath('/files/*', { rest: 'a/b.txt' })       // '/files/a/b.txt'
 * buildPath('/about', {})                          // '/about'
 * ```
 *
 * Values are `encodeURIComponent`-encoded, which is exactly what
 * {@link matchRoute} decodes on the way back, so a param containing a slash or
 * a space survives the round trip. A `rest` value is encoded per SEGMENT rather
 * than whole, because it is a path and its slashes are structure — the same
 * reading the matcher takes when it joins the tail back together.
 *
 * The query string is not this function's job. A search string is not derived
 * from the route pattern, so there is nothing here to type it against, and an
 * app appends its own.
 */
export const buildPath = <P extends string>(pattern: P, params: PathParams<P>): string => {
  // The mapped type above is a statement about which keys exist; reading them
  // back out is ordinary record access, and a cast is the only way to say that
  // to the compiler. It is safe in the direction that matters: every key this
  // loop reads is one the pattern named, which is the same set the type has.
  const values = params as RouteParams

  const segments: string[] = []
  for (const segment of pattern.split('/')) {
    if (segment.length === 0) continue
    if (segment === '*') {
      const rest = values['rest'] ?? ''
      // Split and rejoin so the slashes inside a wildcard stay structural while
      // everything around them is encoded.
      if (rest.length > 0) segments.push(...rest.split('/').map(encodeURIComponent))
      continue
    }
    if (segment.startsWith(':')) {
      segments.push(encodeURIComponent(values[segment.slice(1)] ?? ''))
      continue
    }
    segments.push(segment)
  }

  return `/${segments.join('/')}`
}
