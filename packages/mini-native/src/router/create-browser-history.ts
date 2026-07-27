import type { Dispose } from '../types'
import type { RouterHistory, RouterLocation } from './history'

/** Options for {@link createBrowserHistory}. */
export type BrowserHistoryOptions = {
  /**
   * URL strategy.
   *
   * `history` uses real paths and needs a server that serves the app for every
   * one of them; `hash` puts everything after `#`, which needs no server
   * configuration and is safe on static hosting.
   */
  mode?: 'history' | 'hash'
  /**
   * A path prefix every route lives under (history mode only), e.g. `/app`.
   *
   * Stripped before matching and prepended on navigation, so route patterns
   * stay written relative to the mount point and an app can move without its
   * route table changing.
   */
  base?: string
}

/**
 * Navigation through the browser's own session history.
 *
 * This is the second place in the package that knows what a browser is, and it
 * is on its own entry point for that reason: `@amritk/mini-native/router` stays
 * platform-free, so a device build that imports it cannot accidentally pull a
 * `window` reference along. The import boundary suite asserts that.
 *
 * The interesting part is what a browser cannot tell you. `history.length`
 * counts entries from every page the tab has visited, so it cannot answer
 * "would going back leave this app" — which is the only question a back chevron
 * actually asks. So this counts its own pushes instead: {@link
 * RouterHistory.depth} is how many steps the app has taken since it started,
 * which is exactly right and is the same number the in-memory stack reports.
 */
export const createBrowserHistory = ({ mode = 'history', base = '' }: BrowserHistoryOptions = {}): RouterHistory => {
  const listeners = new Set<() => void>()
  // Our own pushes, not the browser's. See the note above.
  let depth = 0

  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }

  const read = (): RouterLocation => {
    if (mode === 'hash') {
      const raw = window.location.hash.slice(1) || '/'
      const at = raw.indexOf('?')
      return at === -1 ? { path: raw, search: '' } : { path: raw.slice(0, at), search: raw.slice(at) }
    }
    return { path: stripBase(window.location.pathname, base), search: window.location.search }
  }

  const urlFor = (to: RouterLocation): string =>
    mode === 'hash' ? `#${to.path}${to.search}` : `${base}${to.path}${to.search}`

  // `popstate` covers back and forward; `hashchange` covers somebody editing
  // the fragment. Neither fires for our own pushState, which is why `navigate`
  // refreshes the router directly.
  const event = mode === 'hash' ? 'hashchange' : 'popstate'
  const onPopState = (): void => {
    // A back that leaves the app entirely never reaches us, so clamping at zero
    // is the honest floor rather than a guard against a bug.
    depth = Math.max(0, depth - 1)
    notify()
  }
  window.addEventListener(event, onPopState)

  return {
    location: read,

    push: (to) => {
      window.history.pushState(null, '', urlFor(to))
      depth += 1
    },

    replace: (to) => {
      // A replace is a redirect rather than a step, so the depth is unchanged —
      // going back from here should reach whatever preceded the thing that was
      // replaced, not the thing itself.
      window.history.replaceState(null, '', urlFor(to))
    },

    back: () => {
      // Deliberately not decremented here: the browser answers asynchronously
      // with a `popstate`, and that is where the count moves. Doing it in both
      // places would take it down twice.
      window.history.back()
    },

    depth: () => depth,

    subscribe: (listener): Dispose => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Removes the base prefix from a pathname before matching.
 *
 * Only stripped on a path boundary: `/app` strips from `/app/users` and from
 * `/app` itself, but not from `/application`, where it is a coincidental
 * character prefix rather than a real segment.
 */
const stripBase = (pathname: string, base: string): string => {
  if (base && pathname.startsWith(base)) {
    const rest = pathname.slice(base.length)
    return rest.startsWith('/') || rest === '' ? rest || '/' : pathname
  }
  return pathname
}
