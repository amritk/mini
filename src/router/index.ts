/**
 * `@amritk/niv/router` — a small client-side router for the dashboards
 * (history and hash modes). It matches the URL against a route table into a
 * reactive `route` signal, provides `navigate` and a `<Link>` that intercepts
 * plain clicks, and attaches nothing to the `.` entry: the single-view widget
 * never imports it, so its bytes stay out of that bundle.
 *
 * Composition is explicit — `<Link>` takes `router.navigate` as a prop rather
 * than reading an ambient context, matching niv's prop-drilling charter.
 */

// `matchRoute` is the router's pattern grammar on its own, for matching a path
// outside a router. `buildPath` is the same grammar read backwards — a pattern
// plus its params to a path — and `PathParams` is it read at the type level, so
// `buildPath('/users/:id', { id })` cannot forget a param or misspell one.
export { buildPath } from './build-path'
export type {
  NavigateOptions,
  Route,
  Router,
  RouterMode,
  RouterOptions,
  RouteState,
} from './create-router'
export { createRouter } from './create-router'
export type { LinkProps } from './link'
export { Link } from './link'
export type { RouteParams } from './match-route'
export { matchRoute } from './match-route'
export type { PathParams } from './path-params'
export type { RouterViewProps } from './view'
export { RouterView } from './view'
