import { requireHost } from '../current-host'
import { type ChildFactory, renderChild } from '../render-child'
import type { HostElement } from '../types'
import type { Route, Router } from './create-router'
import type { RouteParams } from './match-route'

/** Props for {@link RouteView}. */
export type RouteViewProps<R extends Route> = {
  router: Router<R>
  /** Rendered when nothing matched. Nothing renders when it is omitted. */
  fallback?: () => HostElement
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
 * A native navigation STACK — where `/users/1` → `/users/2` pushes a second
 * screen and animates — is a layer above this and is not built. This is the
 * single-slot version, which is what the web wants and what a device wants for
 * a tab's root.
 *
 * ```tsx
 * <RouteView router={router} fallback={() => <NotFound />} />
 * ```
 */
export const RouteView = <R extends Route>(props: RouteViewProps<R>): HostElement => {
  const wrapper = requireHost().createFlowHost()

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
