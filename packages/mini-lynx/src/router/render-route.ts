import type { RouteParams } from '@amritk/mini-helpers'

import type { LynxElement } from '../types'
import type { AnyRoute } from './create-router'

/**
 * Builds a matched route's screen — the one place that calls a `view` the
 * router cannot otherwise call.
 *
 * {@link AnyRoute} declares `view` as taking `() => never`, because that is the
 * only params getter every `Route<P>` accepts and so the only one a table of
 * mixed patterns can be constrained by. What the router actually has is the
 * flat record it matched, and the step from one to the other is a cast.
 *
 * It is sound for the reason the type system cannot see: the params handed in
 * were produced by `matchRoute` against THIS route's own pattern, so they carry
 * exactly the keys `PathParams` promised the view. The cast is confined here so
 * that claim is made once, next to its justification, rather than at each of
 * the two call sites that render a screen.
 */
export const renderRoute = (route: AnyRoute, params: () => RouteParams): LynxElement =>
  (route.view as (params: () => RouteParams) => LynxElement)(params)
