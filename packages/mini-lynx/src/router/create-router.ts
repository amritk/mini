import { matchRoute, parseQuery, type RouteParams } from '@amritk/mini-helpers'

import { onCleanup } from '../on-cleanup'
import { batch, type ReadonlySignal, signal } from '../signals'
import type { Dispose, LynxElement } from '../types'
import { untrack } from '../untrack'
import type { RouterHistory, RouterLocation } from './history'

/**
 * One route definition.
 *
 * `view` receives the params as a GETTER rather than as a value, which is the
 * same shape `Show` hands its narrowed value over in, and for the same reason:
 * a component runs exactly once, so a plain object would be the params as they
 * were when the screen was built. Reading `params()['id']` inside a binding keeps
 * it live, which is what makes `/users/1` → `/users/2` update in place.
 *
 * Every other key is opaque to the router and carried through on the match, so
 * per-route metadata — a title, a required role, a transition — rides along
 * without the router needing to know about it.
 */
export type Route = {
  path: string
  view: (params: () => RouteParams) => LynxElement
} & Record<string, unknown>

/** The current location, matched against the route table. */
export type RouteState<R extends Route> = {
  /** The active path, with no query and no base prefix. */
  path: string
  /** The query string including its leading `?`, or `''`. */
  search: string
  /** The query parsed into a record — read `query.page` directly. */
  query: RouteParams
  /** Params captured from the matched route's pattern. */
  params: RouteParams
  /** The matched route, or `null` when nothing matched — render a not-found screen. */
  route: R | null
}

/** Options for a single {@link Router.navigate} call. */
export type NavigateOptions = {
  /** Take the place of the current entry rather than stacking on it — a redirect, not a step. */
  replace?: boolean
}

/** Options for {@link createRouter}. */
export type RouterOptions<R extends Route> = {
  /** The route table, tried top to bottom; the first pattern that matches wins. */
  routes: readonly R[]
  /**
   * How navigation happens on this target. `createMemoryHistory()` for a device
   * or a test, `createBrowserHistory()` from `@amritk/mini-lynx/router/browser`
   * for the web.
   */
  history: RouterHistory
}

/** A live router. */
export type Router<R extends Route> = {
  /** The reactive current location. Read it in a binding to react to navigation. */
  route: ReadonlySignal<RouteState<R>>
  /** Go somewhere. Pass `{ replace: true }` for a redirect. */
  navigate: (to: string, options?: NavigateOptions) => void
  /** Go back one entry. A no-op at the root. */
  back: () => void
  /**
   * How many entries deep the app is, as a signal — `0` is where it started.
   *
   * This is what separates a push from a redirect for anything watching, and
   * `RouteView` is the reason it has to be exposed rather than staying the
   * private counter behind {@link Router.canGoBack}: the single-slot view can
   * tell the two apart by the matched route alone, but a STACK cannot.
   * `/users/1` → `/users/2` is one route and two screens when it was pushed,
   * and one route and one screen when it was replaced. Nothing in `route`
   * distinguishes those, and the depth does.
   */
  depth: ReadonlySignal<number>
  /**
   * Whether there is anywhere to go back TO within this app, as a signal — so a
   * back chevron can be shown only where it would do something.
   */
  canGoBack: ReadonlySignal<boolean>
  /** Detach the history subscription. Registered against the enclosing scope too. */
  stop: Dispose
}

/**
 * Creates a router: it reads the current location from the history it was
 * given, matches it against the route table into a reactive `route` signal, and
 * keeps that signal in sync as the app navigates.
 *
 * The split that makes this portable is in the history rather than here.
 * Matching is string arithmetic and ports for nothing; only *moving between
 * locations* has a per-target answer, and that answer is the object passed in.
 * Nothing in this file knows whether it is driving an address bar or a
 * navigation stack.
 *
 * ```ts
 * const router = createRouter({
 *   history: createMemoryHistory(),
 *   routes: [
 *     { path: '/', view: () => <Home /> },
 *     { path: '/users/:id', view: (params) => <User id={() => params()['id']} /> },
 *   ],
 * })
 * ```
 */
export const createRouter = <R extends Route>(options: RouterOptions<R>): Router<R> => {
  const history = options.history

  const read = (): RouteState<R> => resolve(options.routes, history.location())
  const route = signal<RouteState<R>>(read())
  const depth = signal(history.depth())

  // Batched because they are one fact about where the app is, not two. Written
  // separately, anything reading both — a stack, above all — would see a state
  // that never actually existed: the new location at the old depth, which reads
  // as a redirect onto the pushed route and swaps the screen that was about to
  // be pushed over.
  //
  // And skipped entirely when nothing moved, because `read()` builds a fresh
  // object every time and a fresh object always propagates. `back()` reaches
  // here twice for one navigation — once because an in-memory history notifies
  // (a hardware back gesture calls it from outside, so it must), once because
  // this router refreshes after calling it (a browser answers asynchronously,
  // so it must) — and the second pass would otherwise re-announce a location
  // the app is already at, restarting whatever the first one started.
  const refresh = (): void => {
    const next = read()
    const nextDepth = history.depth()
    if (untrack(() => depth() === nextDepth && settled(route(), next))) return
    batch(() => {
      route(next)
      depth(nextDepth)
    })
  }

  // Fires for changes that came from OUTSIDE — a browser back button, a deep
  // link, a hardware back gesture. Navigation through this router refreshes
  // directly, since it already knows.
  const stop = history.subscribe(refresh)
  onCleanup(stop)

  return {
    route,

    navigate: (to, navigateOptions) => {
      const target = splitLocation(to)
      if (navigateOptions?.replace === true) history.replace(target)
      else history.push(target)
      refresh()
    },

    back: () => {
      history.back()
      refresh()
    },

    depth,

    canGoBack: () => depth() > 0,

    stop,
  }
}

/**
 * Whether two states describe the same place.
 *
 * Path, query string, and matched route are the whole comparison: `params` and
 * `query` are derived from the first two by pure functions, so two states that
 * agree on these agree on everything.
 */
const settled = <R extends Route>(current: RouteState<R>, next: RouteState<R>): boolean =>
  current.path === next.path && current.search === next.search && current.route === next.route

/** Splits a `to` string into its path and query halves. */
const splitLocation = (to: string): RouterLocation => {
  const at = to.indexOf('?')
  return at === -1 ? { path: to, search: '' } : { path: to.slice(0, at), search: to.slice(at) }
}

/** Matches a location against the route table, returning the assembled state. */
const resolve = <R extends Route>(routes: readonly R[], location: RouterLocation): RouteState<R> => {
  const query = parseQuery(location.search)
  for (const route of routes) {
    const params = matchRoute(route.path, location.path)
    if (params) return { path: location.path, search: location.search, query, params, route }
  }
  return { path: location.path, search: location.search, query, params: {}, route: null }
}
