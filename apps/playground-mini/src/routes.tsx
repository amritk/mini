import { createRouter, type Route, type Router } from '@amritk/mini/router'

import { BindingsPage } from './pages/bindings'
import { FlowPage } from './pages/flow'
import { FormsPage } from './pages/forms'
import { JsxPage } from './pages/jsx'
import { ListsPage } from './pages/lists'
import { OverviewPage } from './pages/overview'
import { QueryPage } from './pages/query'
import { RouterPage } from './pages/router'
import { SignalsPage } from './pages/signals'

/**
 * The route table and the one router instance the app runs on.
 *
 * It lives in its own module deliberately: the entry point is a hot-update
 * boundary and re-runs on every edit below it, so anything that should survive
 * an edit — here, the current location and its listeners — belongs in a module
 * the edit does not touch.
 *
 * Route metadata is opaque to the router, so `label` and `nav` ride along on
 * the definition and the shell reads them straight off the table rather than
 * keeping a second list of links in sync with it.
 */
export type AppRoute = Route & {
  /** The sidebar label. */
  readonly label: string
  /** Builds the page. `RouterView` looks for this key by default. */
  readonly view: () => HTMLElement
  /** Whether the route gets a sidebar entry — the `:params` variant does not. */
  readonly nav: boolean
}

const ROUTES: readonly AppRoute[] = [
  { path: '/', label: 'Overview', nav: true, view: () => <OverviewPage router={router} /> },
  { path: '/signals', label: 'Signals', nav: true, view: () => <SignalsPage /> },
  { path: '/jsx', label: 'JSX', nav: true, view: () => <JsxPage /> },
  { path: '/bindings', label: 'Bindings', nav: true, view: () => <BindingsPage /> },
  { path: '/flow', label: 'Control flow', nav: true, view: () => <FlowPage /> },
  { path: '/lists', label: 'Keyed lists', nav: true, view: () => <ListsPage /> },
  { path: '/forms', label: 'Forms', nav: true, view: () => <FormsPage /> },
  { path: '/query', label: 'Async data', nav: true, view: () => <QueryPage /> },
  { path: '/router', label: 'Routing', nav: true, view: () => <RouterPage router={router} /> },
  // The same page under a params pattern. Navigating between the two `:owner`
  // values keeps the page mounted and only updates `route().params`.
  { path: '/router/:owner/:repo', label: 'Routing', nav: false, view: () => <RouterPage router={router} /> },
]

/** The sidebar's source of truth — one list, derived from the table above. */
export const NAV = ROUTES.filter((route) => route.nav)

/**
 * `history` mode, so every page has a real URL. That is a deployment
 * requirement rather than a free choice: `wrangler.jsonc` sets
 * `not_found_handling: "single-page-application"`, which is what makes a hard
 * reload of `/forms` serve `index.html` instead of a 404. Hash mode needs no
 * such server config and is the right pick when you cannot configure one.
 */
export const router: Router<AppRoute> = createRouter<AppRoute>({ routes: ROUTES, mode: 'history' })
