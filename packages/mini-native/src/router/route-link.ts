import { jsx } from '../jsx-runtime'
import type { HostElement, MaybeReactive, MiniChildren } from '../types'
import { Link, type LinkProps } from '../ui/link'
import type { NavigateOptions } from './create-router'

/** Props for {@link RouteLink}. */
export type RouteLinkProps = Omit<LinkProps, 'href' | 'onTap'> & {
  /** Where it goes. Also becomes the `href`, so the web gets a real, shareable URL. */
  to: MaybeReactive<string>
  /**
   * The router's `navigate`. Passed explicitly rather than pulled from a
   * context, so this stays a plain component with no ambient state — an app
   * that wants it ambient can put the router in a context of its own, and one
   * that has two routers is not forced to pick a winner.
   */
  navigate: (to: string, options?: NavigateOptions) => void
  /** Replace the current entry instead of stacking on it. */
  replace?: boolean
  children?: MiniChildren
}

/**
 * A link that navigates through the router instead of leaving the app.
 *
 * It is a real {@link Link} underneath, which is the point: on the web that is
 * an actual `<a href>`, so middle-click, open-in-new-tab, copy-link, and a
 * crawler all work, and only the plain activation that would otherwise reload
 * the app is intercepted. On a device the href is ignored and the tap
 * navigates.
 *
 * ## The one place this layer touches `raw`
 *
 * Intercepting a web activation means calling `preventDefault`, and leaving a
 * modified click alone — Cmd, Ctrl, Shift, Alt, or a non-primary button — means
 * reading modifier keys. Neither exists in the framework's normalised payload,
 * because neither exists on a device: they are exactly the target-specific
 * detail that `raw` is the escape hatch for.
 *
 * So this reads `raw`, defensively, and it is worth being explicit that this is
 * platform-specific code rather than pretending otherwise. It lives here for
 * the same reason the semantics layer lives in the package: it is knowledge
 * that is easy to get wrong, invisible when you do — a router link that eats
 * Cmd-click is a bug users report as "your site is broken" — and worth writing
 * once instead of in every app.
 */
export const RouteLink = (props: RouteLinkProps): HostElement => {
  const { to, navigate, replace, ...rest } = props
  const href = typeof to === 'function' ? to : () => to

  return jsx(Link as unknown as (props: Record<string, unknown>) => HostElement, {
    ...rest,
    href,
    onTap: (event: { raw: unknown }) => {
      const raw = event.raw as ModifiedActivation | null | undefined
      // Nothing to intercept on a target with no default to prevent: the tap is
      // the whole gesture there, so navigate and be done.
      if (!raw || typeof raw.preventDefault !== 'function') {
        navigate(href(), { replace: replace ?? false })
        return
      }

      // Let the browser have the ones where its own behaviour is what the user
      // asked for — a new tab, a download, a handler that already claimed it.
      if (
        raw.defaultPrevented === true ||
        (raw.button !== undefined && raw.button !== 0) ||
        raw.metaKey === true ||
        raw.ctrlKey === true ||
        raw.shiftKey === true ||
        raw.altKey === true
      ) {
        return
      }

      raw.preventDefault()
      navigate(href(), { replace: replace ?? false })
    },
  })
}

/**
 * The parts of a web activation that decide whether the browser should keep it.
 *
 * Everything is optional because this is a shape read off `raw`, which is
 * `unknown` by design — on a device none of it is there, and the code above
 * checks rather than assumes.
 */
type ModifiedActivation = {
  preventDefault?: () => void
  defaultPrevented?: boolean
  button?: number
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}
