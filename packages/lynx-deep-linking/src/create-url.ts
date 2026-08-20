import type { CreateURLOptions } from './types'

/**
 * Builds a URL that points back into this app.
 *
 * The one job it does that string concatenation gets wrong is encoding: a
 * `redirect_uri` carrying a state token with a `&` in it, or a path segment
 * with a space, is a link that silently loses half of itself. Everything here
 * goes through `encodeURIComponent` except the separators.
 *
 * The scheme is a parameter rather than something read from the device on
 * purpose. Native code *could* report the host app's declared schemes, but
 * which one an app wants back is a decision the app makes, and a build-time
 * constant beats a bridge call that can only ever return what you already knew.
 *
 * ## Read `parseURL` before choosing a shape
 *
 * `createURL('myapp', 'profile/42')` produces `myapp://profile/42`, which is
 * what every OAuth provider's redirect-URI field expects and what parses back
 * as host `profile`, path `/42`. Passing `host` gives the other shape —
 * `createURL('myapp', 'profile/42', { host: 'app' })` is `myapp://app/profile/42`,
 * which round-trips as a plain path. Neither is wrong; picking one before your
 * routes exist is much cheaper than after.
 *
 * @example
 * ```ts
 * createURL('myapp', 'auth/callback', { query: { state: 'a b&c' } })
 * // 'myapp://auth/callback?state=a%20b%26c'
 *
 * createURL('myapp')
 * // 'myapp://'
 * ```
 */
export const createURL = (scheme: string, path = '', options: CreateURLOptions = {}): string => {
  const { host = '', query = {}, fragment } = options

  // Segment by segment, so the separators survive and everything between them
  // is encoded. A caller who already encoded is the case this cannot detect and
  // would double-encode; `path` takes readable text.
  const segments = path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map(encodeURIComponent)
    .join('/')

  // A host and a path both want the `/` between them; a path with no host is
  // the `myapp://profile/42` shape, where the first segment IS the authority.
  const base = `${scheme}://${encodeAuthority(host)}${host && segments ? '/' : ''}${segments}`

  const search = Object.entries(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')

  return `${base}${search ? `?${search}` : ''}${fragment ? `#${encodeURIComponent(fragment)}` : ''}`
}

/**
 * Encodes an authority without destroying the punctuation that belongs in one.
 *
 * `encodeURIComponent` is too strong here — it would eat the `:` in
 * `localhost:3000` and the brackets around an IPv6 address — and `encodeURI` is
 * too weak, because it leaves `/`, `?` and `#` alone and those are exactly the
 * three characters that END an authority. A host carrying one of them would not
 * be a badly encoded host, it would be a different URL: `{ host: 'a?b' }` turns
 * the rest of the link into that host's query string, and the `query` this
 * function was asked to append lands after a `?` that is already there.
 *
 * So encode the delimiters and leave the rest to `encodeURI`.
 */
const encodeAuthority = (host: string): string => encodeURI(host).replace(/[/?#]/g, encodeURIComponent)
