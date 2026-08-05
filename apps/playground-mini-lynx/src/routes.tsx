import { type AnyRoute, createRouter, type Router, route } from '@amritk/mini-lynx/router'
import { createBrowserHistory } from '@amritk/mini-lynx/router/browser'

import { ComposeScreen } from './screens/compose'
import { DataScreen } from './screens/data'
import { ElementsScreen } from './screens/elements'
import { EngineScreen } from './screens/engine'
import { EventsScreen } from './screens/events'
import { FlowScreen } from './screens/flow'
import { FormsScreen } from './screens/forms'
import { KeyboardScreen } from './screens/keyboard'
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
 *
 * Every entry goes through `route()`, which is what keeps each pattern's
 * literal type alive long enough for the view to be handed params typed from
 * it — `/routing/:owner` below gives its view a `() => { owner: string }`, and
 * a misspelt param is a build failure rather than an `undefined` at runtime.
 *
 * The table is annotated `AnyRoute`-based rather than `Route`-based, and that
 * is the one thing worth knowing about the types here: `Route<'/routing/:owner'>`
 * is deliberately NOT assignable to `Route<string>`, because its view demands a
 * getter of `{ owner: string }` and the widened form can only promise the flat
 * record. `AnyRoute` is the constraint that holds patterns of different shapes
 * side by side, which is exactly what a route table is.
 */
export type AppRoute = AnyRoute & {
  /** The tab-bar label. */
  readonly label: string
  /** Two or three characters for the tab bar — no icon set, and none needed. */
  readonly badge: string
  readonly nav: boolean
}

const ROUTES: readonly AppRoute[] = [
  route('/', () => <ElementsScreen />, { label: 'Elements', badge: '◻', nav: true }),
  route('/text', () => <TextScreen />, { label: 'Text', badge: 'Aa', nav: true }),
  route('/list', () => <ListScreen />, { label: 'List', badge: '☰', nav: true }),
  route('/styling', () => <StylingScreen />, { label: 'Styling', badge: '◐', nav: true }),
  route('/events', () => <EventsScreen />, { label: 'Events', badge: '✋', nav: true }),
  route('/flow', () => <FlowScreen />, { label: 'Flow', badge: '⇄', nav: true }),
  route('/compose', () => <ComposeScreen />, { label: 'Compose', badge: '⧉', nav: true }),
  route('/forms', () => <FormsScreen />, { label: 'Forms', badge: '✎', nav: true }),
  route('/keyboard', () => <KeyboardScreen />, { label: 'Keyboard', badge: '⌨', nav: true }),
  route('/data', () => <DataScreen />, { label: 'Data', badge: '⇅', nav: true }),
  route('/engine', () => <EngineScreen />, { label: 'Engine', badge: '◆', nav: true }),
  route('/routing', (params) => <RoutingScreen params={params} />, { label: 'Routing', badge: '↦', nav: true }),
  // The same screen under a second pattern, which is what lets it show the one
  // behaviour a router is judged on: when a screen is kept and when it is torn
  // down. Its view is handed a `() => { owner: string }` here and a `() => {}`
  // above, and the screen accepts both by declaring `owner` optional — which,
  // from where it sits, it is.
  route('/routing/:owner', (params) => <RoutingScreen params={params} />, {
    label: 'Routing',
    badge: '↦',
    nav: false,
  }),
]

export type AppRouter = Router<AppRoute>

/** The tab bar's source of truth — one list, derived from the table above. */
export const TABS = ROUTES.filter((entry) => entry.nav)

/**
 * A browser history, because this preview runs in a browser.
 *
 * `createMemoryHistory` is the real thing on a device — a Lynx app owns its
 * stack of screens outright and has no address bar to keep correct — and this
 * is the real thing here. That the two are interchangeable is the seam working:
 * the route table, the screens, the stack and the matching are all target-free,
 * and which history is passed in is the entire difference between the builds.
 *
 * It also gives the preview back what it lost when the DOM host went. `/forms`
 * is a URL you can reload, bookmark and send to somebody, and the browser's own
 * back button drives the router through `popstate` like any other navigation.
 * The Worker serving this is configured with a single-page-app fallback, so a
 * hard reload on a deep path still reaches `index.html`.
 */
export const router: AppRouter = createRouter<AppRoute>({
  history: createBrowserHistory(),
  routes: ROUTES,
})
