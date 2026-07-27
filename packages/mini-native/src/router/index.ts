/**
 * Routing — the half that is arithmetic, and a seam for the half that is not.
 *
 * The split is the entire design here. **Matching a pattern against a path is
 * string arithmetic**: there is nothing underneath it, and `@amritk/mini`'s
 * router uses the same function for the same reason, which is why the two agree
 * about what a route pattern means. **Moving between locations is not**: an app
 * owns a stack of screens, the gesture that unwinds it arrives from outside, and
 * an app embedded in a host shell may not own the stack at all.
 *
 * So the router takes a {@link RouterHistory}, and {@link createMemoryHistory}
 * is the default — a complete implementation rather than a test double, because
 * a stack of screens the app holds is genuinely what navigation is here. The
 * seam stays because an app that is one screen of a larger native shell needs
 * to hand its own in.
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
 * ## Two ways to render, and the difference matters
 *
 * `RouteView` renders ONE slot: `/users/1` → `/users/2` keeps the screen and
 * updates its params, and a different route swaps the subtree. The screen that
 * left is gone.
 *
 * `RouteStack` renders a stack, which is what a device actually does: a pushed
 * screen sits on the one below, the one below stays alive with its scroll
 * position and its half-typed form, and going back reveals it rather than
 * rebuilding it. It is `router.depth` that makes that expressible — the matched
 * route cannot tell a push from a replace, because `/users/1` → `/users/2` is
 * two screens one way and one screen the other.
 *
 * Reach for `RouteView` for a tab body and `RouteStack` for navigation.
 *
 * ## What is deliberately not here
 *
 * **A browser history.** There is no web target here, so there is nothing for
 * one to drive. An earlier version of this package shipped `createBrowserHistory`
 * on its own entry point; it went with the DOM host.
 *
 * **Guards and lazy routes.** Both are expressible today — a guard is a
 * `replace` in a `watch` on `route()`, and a lazy route is a `view` that
 * renders a placeholder until its import lands — and neither has earned an API
 * before a real app has asked for one twice.
 */

export { matchRoute, parseQuery, type RouteParams } from '@amritk/mini-helpers'

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
export { RouteLink, type RouteLinkProps } from './route-link'
export { RouteStack, type RouteStackProps } from './route-stack'
export { RouteView, type RouteViewProps } from './route-view'
export {
  fadeTransition,
  type StackChange,
  type StackTransition,
  type StackTransitionContext,
  type TransitionTiming,
} from './stack-transition'
