import type { RouteParams } from '@amritk/mini-helpers'

import { type ChildFactory, renderChild } from '../render-child'
import { createWrapper } from '../tree'
import type { LynxElement } from '../types'
import type { Route, Router } from './create-router'

/** Props for {@link RouteView}. */
export type RouteViewProps<R extends Route> = {
  router: Router<R>
  /** Rendered when nothing matched. Nothing renders when it is omitted. */
  fallback?: () => LynxElement
}

/**
 * Renders whichever route currently matches.
 *
 * The behaviour worth knowing is what it does NOT rebuild. Navigating
 * `/users/1` → `/users/2` stays on the same route, so the screen is kept and
 * its `params()` getter simply reports new values — which means a scroll
 * position, a focused field, and any in-flight state inside it survive.
 * Navigating `/users/1` → `/settings` is a different route, so that subtree is
 * torn down and the new one built.
 *
 * That falls out of `renderChild` swapping on factory identity rather than on
 * every change to what it read, and it is the reason each route gets exactly
 * one factory, remembered here.
 *
 * The slot is a `wrapper`, so nothing the router interposes takes part in
 * layout or in the accessibility tree — a screen sits directly inside whatever
 * the `RouteView` was written in.
 *
 * This is the SINGLE-SLOT version, which is what a tab's root wants: the screen
 * that left is gone. When `/users/1` → `/users/2` should push a second screen
 * over a first that stays alive underneath, reach for `RouteStack` instead.
 *
 * ```tsx
 * <RouteView router={router} fallback={() => <NotFound />} />
 * ```
 */
export const RouteView = <R extends Route>(props: RouteViewProps<R>): LynxElement => {
  const wrapper = createWrapper()

  // One stable factory per route, so a params-only change resolves to the same
  // reference and `renderChild` leaves the screen alone. Keyed weakly, because
  // a route table is usually a module constant but does not have to be.
  const factories = new WeakMap<R, ChildFactory>()
  const params = (): RouteParams => props.router.route().params

  const fallback: ChildFactory | null = props.fallback === undefined ? null : () => props.fallback?.() ?? null

  renderChild(wrapper, () => {
    const matched = props.router.route().route
    if (!matched) return fallback

    const existing = factories.get(matched)
    if (existing) return existing

    const factory: ChildFactory = () => matched.view(params)
    factories.set(matched, factory)
    return factory
  })

  return wrapper
}
