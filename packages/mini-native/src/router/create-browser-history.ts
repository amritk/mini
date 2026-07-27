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
 * actually asks. So this tracks its own pushes instead: {@link
 * RouterHistory.depth} is how many steps the app has taken since it started,
 * which is exactly right and is the same number the in-memory stack reports.
 *
 * That number is STAMPED onto each entry rather than merely counted, and the
 * difference only shows once something reads it structurally. Counting steps
 * means treating every `popstate` as one step down, which is right for a back,
 * backwards for a FORWARD — the button puts the app deeper and the count says
 * shallower — and wrong by several for a jump through the history list. None of
 * that is visible in a `RouteView`, which reads the matched route and nothing
 * else. All of it is visible in a `RouteStack`, which pops the screens the
 * number says.
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
  // Read from `window.history.state` rather than from the event, so one handler
  // covers both modes: a `popstate` carries the restored state and a
  // `hashchange` does not, while the browser has already swapped
  // `history.state` over by the time either one fires.
  const onPopState = (): void => {
    // The depth we stamped onto the entry being restored, which is the only
    // thing that answers this honestly. Counting steps instead — one down per
    // `popstate` — is right for a back and backwards for a FORWARD, and it is
    // wrong by more than one for a multi-step jump through the history list.
    // Neither shows up in a single-slot `RouteView`, where the matched route is
    // all that is read; both are plainly visible in a stack, which pops the
    // screens the number says.
    const stamped = depthOf(window.history.state)
    // A back that leaves the app entirely never reaches us, and the entry the
    // app started on carries no stamp of ours — so an unstamped entry is the
    // root, not a missing value to guess at.
    depth = stamped ?? 0
    notify()
  }
  window.addEventListener(event, onPopState)

  return {
    location: read,

    push: (to) => {
      depth += 1
      // Stamped onto the entry rather than only counted here, so that coming
      // BACK to it later reports the depth it actually had. See `onPopState`.
      window.history.pushState(stamp(depth), '', urlFor(to))
    },

    replace: (to) => {
      // A replace is a redirect rather than a step, so the depth is unchanged —
      // going back from here should reach whatever preceded the thing that was
      // replaced, not the thing itself.
      window.history.replaceState(depth === 0 ? null : stamp(depth), '', urlFor(to))
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
 * The key the depth is stamped under.
 *
 * Namespaced because `history.state` is shared with whatever else the page
 * does with it, and a bare `depth` is exactly the name something else would
 * also pick. The state object is otherwise left alone: this reads its own key
 * and writes its own key, so an entry that already carried something keeps it.
 */
const DEPTH_KEY = '__mnDepth'

/** Builds the state object stamped onto an entry, preserving any state already there. */
const stamp = (depth: number): Record<string, unknown> => ({
  ...(typeof window.history.state === 'object' && window.history.state !== null ? window.history.state : {}),
  [DEPTH_KEY]: depth,
})

/**
 * Reads the depth back off an entry's state, or `undefined` when it carries
 * none — which is the entry the app started on, and anything the browser
 * pushed that this history did not.
 */
const depthOf = (state: unknown): number | undefined => {
  if (typeof state !== 'object' || state === null) return undefined
  const value = (state as Record<string, unknown>)[DEPTH_KEY]
  return typeof value === 'number' ? value : undefined
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
