import { stripBase } from '@amritk/mini-helpers'

import type { Dispose } from '../../types'
import type { RouterHistory, RouterLocation } from '../history'

/** Options for {@link createBrowserHistory}. */
export type BrowserHistoryOptions = {
  /**
   * A path prefix every route lives under, e.g. `/app`.
   *
   * Stripped before the location is read and prepended on the way out, so route
   * patterns stay written relative to the mount point. History mode needs a
   * server that serves the app for every path under the prefix.
   */
  base?: string
}

/** The shape stamped into `history.state` — one number, under a key nothing else will pick. */
type DepthState = { readonly __miniLynxDepth: number }

/**
 * A history backed by the browser's address bar, for a Lynx app previewed or
 * shipped on the web.
 *
 * {@link createMemoryHistory} is the real thing on a device, and this is the
 * real thing in a browser, which is a genuinely different place: the location
 * is not the app's private stack but a URL the user can edit, reload, bookmark
 * and share, and back is a button the browser owns rather than a gesture the
 * platform forwards. An app that renders both wants the same route table to
 * drive both, and the {@link RouterHistory} seam is where that difference has
 * always belonged.
 *
 * ```ts
 * import { createRouter } from '@amritk/mini-lynx/router'
 * import { createBrowserHistory } from '@amritk/mini-lynx/router/browser'
 *
 * const router = createRouter({ history: createBrowserHistory(), routes })
 * ```
 *
 * ## Why depth is stamped into `history.state`
 *
 * `RouteStack` reads {@link RouterHistory.depth} to tell a push from a replace,
 * so the number has to be right or the stack shows the wrong screen. The
 * browser will not tell you: `window.history.length` counts the whole TAB —
 * every page visited before the app was loaded, and every entry a sibling app
 * pushed — so it is both too large and, once the user has gone back, wrong in
 * the other direction too.
 *
 * So each entry carries its own depth, written when it is created and read back
 * off whatever entry the browser has moved to. That is the only reading that
 * survives the two things a memory stack never has to face: a reload, where the
 * app restarts mid-stack and the state is still there, and a forward button,
 * which is a navigation nothing in the app initiated.
 *
 * The state is stamped under `__miniLynxDepth` alongside anything already
 * there, so an app that keeps its own `history.state` keeps it.
 *
 * ## Where it is asynchronous, and why that is fine
 *
 * `pushState` and `replaceState` take effect immediately, so `navigate` sees the
 * new location the moment it returns. `back()` does not: the browser answers on
 * a later `popstate`, which is exactly what {@link RouterHistory.subscribe}
 * delivers. The router refreshes on both — once eagerly, once from the event —
 * and skips the pass where nothing moved, which is why the eager one is
 * harmless rather than a flash of the wrong screen.
 */
export const createBrowserHistory = (options: BrowserHistoryOptions = {}): RouterHistory => {
  const base = options.base ?? ''

  /** The depth stamped on the entry the browser is currently showing, or `0`. */
  const currentDepth = (): number => {
    const state: unknown = window.history.state
    if (typeof state !== 'object' || state === null) return 0
    const depth = (state as Partial<DepthState>).__miniLynxDepth
    return typeof depth === 'number' ? depth : 0
  }

  /** Adds this history's depth to whatever the app already had in `history.state`. */
  const stamp = (depth: number): unknown => {
    const state: unknown = window.history.state
    const existing = typeof state === 'object' && state !== null ? state : {}
    return { ...existing, __miniLynxDepth: depth }
  }

  /** The URL to write for a location, with the base put back on. */
  const href = (to: RouterLocation): string => `${base}${to.path}${to.search}`

  // The first entry is stamped on the way in rather than left bare, so the app
  // starts from a depth it wrote itself. Without it, a `back()` onto the entry
  // the app booted at would read 0 from the missing state either way — which is
  // right — but an app deep-linked to and then navigated forward and back would
  // land on an entry whose depth was never recorded.
  window.history.replaceState(stamp(currentDepth()), '')

  const listeners = new Set<() => void>()
  const onPopState = (): void => {
    // Iterate a copy so a listener unsubscribing itself cannot disturb the walk.
    for (const listener of [...listeners]) listener()
  }

  return {
    location: () => ({
      path: stripBase(window.location.pathname, base),
      search: window.location.search,
    }),

    push: (to) => {
      window.history.pushState(stamp(currentDepth() + 1), '', href(to))
    },

    replace: (to) => {
      // The same depth, deliberately: a replace is a redirect rather than a
      // step, and a stack that saw the number move would swap the screen
      // underneath instead of the one on top.
      window.history.replaceState(stamp(currentDepth()), '', href(to))
    },

    back: () => {
      // Unconditional, unlike the memory history's guard. At depth 0 the entry
      // behind the app is the page the user came from, and leaving is what the
      // browser's own back button would do from there — refusing would be this
      // module inventing a rule the platform does not have.
      window.history.back()
    },

    depth: currentDepth,

    // The `popstate` listener is attached with the first subscriber and removed
    // with the last, rather than for the lifetime of the object. A router
    // registers its `stop` against the enclosing scope, so a test — or an app
    // that tears a screen down — expects the window to be left as it was found;
    // a listener that outlived every subscriber would keep this whole history
    // reachable from `window` and fire into a router that had already stopped.
    subscribe: (listener): Dispose => {
      if (listeners.size === 0) window.addEventListener('popstate', onPopState)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) window.removeEventListener('popstate', onPopState)
      }
    },
  }
}
