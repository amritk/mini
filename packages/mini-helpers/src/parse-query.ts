import type { RouteParams } from './match-route'

/**
 * Parses a `?a=1&b=2` search string into a flat record, so a route can expose
 * the query as data a view reads directly (`route().query.page`).
 *
 * Written by hand rather than through `URLSearchParams`, and that is not
 * reinvention. `URLSearchParams` is a web platform global, not an ECMAScript
 * one — it is absent from the `lib: ["ESNext"]` this package type-checks
 * against, and a native engine is under no obligation to provide it. Using it
 * would put a browser assumption in the one part of routing that is otherwise
 * pure, and this file is shared with a package that has no browser.
 *
 * A leading `?` is optional, an empty string yields an empty record, `+` decodes
 * to a space (the form-encoding convention every query string follows), a key
 * with no `=` yields an empty string, and repeated keys keep the LAST value —
 * matching both how `URLSearchParams` iterates and how a form's last field
 * write wins.
 */
export const parseQuery = (search: string): RouteParams => {
  const params: RouteParams = {}
  const raw = search.startsWith('?') ? search.slice(1) : search
  if (!raw) return params

  for (const pair of raw.split('&')) {
    if (pair === '') continue
    const at = pair.indexOf('=')
    const key = at === -1 ? pair : pair.slice(0, at)
    const value = at === -1 ? '' : pair.slice(at + 1)
    params[decode(key)] = decode(value)
  }

  return params
}

/** Decodes one component, treating `+` as a space and tolerating a malformed encoding. */
const decode = (value: string): string => {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}
