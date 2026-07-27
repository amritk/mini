import { createMemoryHistory, createRouter, type Route, type Router } from '@amritk/mini-native/router'

import { ComposeScreen } from './screens/compose'
import { DataScreen } from './screens/data'
import { ElementsScreen } from './screens/elements'
import { EngineScreen } from './screens/engine'
import { EventsScreen } from './screens/events'
import { FlowScreen } from './screens/flow'
import { FormsScreen } from './screens/forms'
import { ListScreen } from './screens/list'
import { RoutingScreen } from './screens/routing'
import { StylingScreen } from './screens/styling'
import { TextScreen } from './screens/text'

/**
 * The route table and the one router the app runs on.
 *
 * Route metadata is opaque to the router, so `label` and `badge` ride along on
 * each definition and the tab bar reads them straight off the table rather than
 * keeping a second list in sync with it.
 */
export type AppRoute = Route & {
  /** The tab-bar label. */
  readonly label: string
  /** Two or three characters for the tab bar — no icon set, and none needed. */
  readonly badge: string
  readonly nav: boolean
}

const ROUTES: readonly AppRoute[] = [
  { path: '/', label: 'Elements', badge: '◻', nav: true, view: () => <ElementsScreen /> },
  { path: '/text', label: 'Text', badge: 'Aa', nav: true, view: () => <TextScreen /> },
  { path: '/list', label: 'List', badge: '☰', nav: true, view: () => <ListScreen /> },
  { path: '/styling', label: 'Styling', badge: '◐', nav: true, view: () => <StylingScreen /> },
  { path: '/events', label: 'Events', badge: '✋', nav: true, view: () => <EventsScreen /> },
  { path: '/flow', label: 'Flow', badge: '⇄', nav: true, view: () => <FlowScreen /> },
  { path: '/compose', label: 'Compose', badge: '⧉', nav: true, view: () => <ComposeScreen /> },
  { path: '/forms', label: 'Forms', badge: '✎', nav: true, view: () => <FormsScreen /> },
  { path: '/data', label: 'Data', badge: '⇅', nav: true, view: () => <DataScreen /> },
  { path: '/engine', label: 'Engine', badge: '◆', nav: true, view: () => <EngineScreen /> },
  { path: '/routing', label: 'Routing', badge: '↦', nav: true, view: (params) => <RoutingScreen params={params} /> },
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
 * A memory history, which is the only kind there is now.
 *
 * The browser history went with the DOM host: this package targets Lynx, and a
 * Lynx app has no URL bar to keep continuously correct. Navigation state lives
 * in memory and deep links arrive as data from the platform, which is what
 * `createMemoryHistory` models. The browser preview loses shareable URLs as a
 * result, and that is the honest trade — a preview should not have affordances
 * the real target does not.
 */
export const router: AppRouter = createRouter<AppRoute>({
  history: createMemoryHistory(),
  routes: ROUTES,
})
