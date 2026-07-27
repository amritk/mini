import { createRouter, type Route, type Router } from '@amritk/mini-native/router'
import { createBrowserHistory } from '@amritk/mini-native/router/browser'

import { CompositionScreen } from './screens/composition'
import { FlowScreen } from './screens/flow'
import { GesturesScreen } from './screens/gestures'
import { PlatformScreen } from './screens/platform'
import { RoutingScreen } from './screens/routing'
import { UiScreen } from './screens/ui'
import { VocabularyScreen } from './screens/vocabulary'

/**
 * The route table and the one router the app runs on.
 *
 * Route metadata is opaque to the router, so `label` and `nav` ride along on
 * each definition and the tab bar reads them straight off the table rather than
 * keeping a second list in sync with it.
 */
export type AppRoute = Route & {
  /** The tab-bar label. */
  readonly label: string
  /** Two or three characters for the tab bar — no icon set, and none needed. */
  readonly badge: string
  /** Whether the route gets a tab. The `:owner` variant does not. */
  readonly nav: boolean
}

const ROUTES: readonly AppRoute[] = [
  { path: '/', label: 'Vocabulary', badge: '五', nav: true, view: () => <VocabularyScreen /> },
  { path: '/ui', label: 'UI', badge: 'ui', nav: true, view: () => <UiScreen /> },
  { path: '/flow', label: 'Flow', badge: '⇄', nav: true, view: () => <FlowScreen /> },
  { path: '/gestures', label: 'Gestures', badge: '✋', nav: true, view: () => <GesturesScreen /> },
  { path: '/platform', label: 'Platform', badge: '◍', nav: true, view: () => <PlatformScreen /> },
  { path: '/composition', label: 'Compose', badge: '⧉', nav: true, view: () => <CompositionScreen /> },
  { path: '/routing', label: 'Routing', badge: '↦', nav: true, view: (params) => <RoutingScreen params={params} /> },
  // The same screen under a params pattern. Moving between the two keeps it
  // mounted and only updates the params getter — `RouteView` renders one slot,
  // and a native navigation STACK is a layer above this that does not exist yet.
  {
    path: '/routing/:owner',
    label: 'Routing',
    badge: '↦',
    nav: false,
    view: (params) => <RoutingScreen params={params} />,
  },
]

export type AppRouter = Router<AppRoute>

/** The tab bar's source of truth — one list, derived from the table above. */
export const TABS = ROUTES.filter((route) => route.nav)

/**
 * `history` mode, so every screen has a real URL. That is a deployment
 * requirement rather than a free choice: `wrangler.jsonc` sets
 * `not_found_handling: "single-page-application"`, which is what makes a hard
 * reload of `/gestures` serve `index.html` instead of a 404. `hash` mode needs
 * no server configuration and is the right pick when you cannot arrange one.
 *
 * The browser history lives on its own entry point — `@amritk/mini-native/router/browser`
 * — precisely so that `@amritk/mini-native/router` stays platform-free and a
 * device build cannot drag a `window` reference along by importing the router.
 */
export const router: AppRouter = createRouter<AppRoute>({
  history: createBrowserHistory({ mode: 'history' }),
  routes: ROUTES,
})
