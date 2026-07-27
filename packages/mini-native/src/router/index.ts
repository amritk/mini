/**
 * Routing — the half that is arithmetic, and a seam for the half that is not.
 *
 * The split is the entire design here, and it is what makes routing portable at
 * all. **Matching a pattern against a path is string arithmetic**: it has no
 * platform in it, and `@amritk/mini`'s router uses the same function for the
 * same reason. **Moving between locations is not**: a browser has an address
 * bar, a back button, and a session history the user shares across tabs; a
 * device has a navigation stack the app owns outright and nothing the user can
 * type into. Pretending those are one thing is how a router ends up with a
 * `window` reference in the middle of a screen.
 *
 * So the router takes a {@link RouterHistory}. `createMemoryHistory` is here
 * and is platform-free — the right shape for a device *and* for a test.
 * `createBrowserHistory` lives on its own entry, `@amritk/mini-native/router/browser`,
 * so importing the router never drags a browser assumption along.
 *
 * ```tsx
 * import { createMemoryHistory, createRouter, RouteView } from '@amritk/mini-native/router'
 *
 * const router = createRouter({
 *   history: createMemoryHistory(),
 *   routes: [
 *     { path: '/', view: () => <Home /> },
 *     { path: '/users/:id', view: (params) => <User id={() => params()['id']} /> },
 *   ],
 * })
 *
 * <RouteView router={router} fallback={() => <NotFound />} />
 * ```
 *
 * ## One slot or a stack
 *
 * Two views over the same router, and the choice is about what the app is
 * rather than about which target it runs on.
 *
 * `RouteView` renders ONE slot: `/users/1` → `/users/2` keeps the screen and
 * updates its params, and a different route swaps the subtree. That is what a
 * web page wants and what a tab's root wants.
 *
 * `RouteStack` renders a STACK: the second user pushes a screen over the first,
 * a back gesture pops it, and every screen underneath stays built — so a scroll
 * position and a half-filled form are still there on the way back. It reads
 * {@link Router.depth} to tell a push from a redirect, which is a distinction
 * the matched route cannot make, and it takes a {@link StackTransition} to
 * animate between screens.
 *
 * ## What is deliberately not here
 *
 * **The web-only obligations.** Document title, scroll restoration, and keeping
 * the URL continuously correct are real work that only one target owes, and
 * they belong in the app's web entry point rather than in a shared router. They
 * are named here so they are known rather than discovered late, in the shape of
 * "we cannot ship the web build".
 *
 * **Guards and lazy routes.** Both are expressible today — a guard is a
 * `replace` in a `watch` on `route()`, and a lazy route is a `view` that
 * renders a placeholder until its import lands — and neither has earned an API
 * before a real app has asked for one twice.
 */

export { createMemoryHistory } from './create-memory-history'
export {
  createRouter,
  type NavigateOptions,
  type Route,
  type Router,
  type RouterOptions,
  type RouteState,
} from './create-router'
export type { RouterHistory, RouterLocation } from './history'
export { matchRoute, type RouteParams } from './match-route'
export { parseQuery } from './parse-query'
export { RouteLink, type RouteLinkProps } from './route-link'
export { RouteStack, type RouteStackProps } from './route-stack'
export { RouteView, type RouteViewProps } from './route-view'
export {
  fadeTransition,
  type StackChange,
  type StackTransition,
  type StackTransitionContext,
} from './stack-transition'
