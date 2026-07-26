import { jsx } from '../jsx-runtime'
import type { HostElement, MaybeReactive, MiniChildren } from '../types'
import type { Forwarded } from './forwarded'
import { wrapTextRuns } from './wrap-text-runs'

/** Props for {@link Link}. */
export type LinkProps = Forwarded<'view'> & {
  /**
   * Where this points.
   *
   * Only the web has anything addressable to point AT, and that asymmetry is
   * handled where it belongs: the DOM host builds a real `<a href>` and a
   * native host ignores the value while still reporting a link. The component
   * says the same thing to both.
   */
  href?: MaybeReactive<string>
  /** The link text. A bare text run is fine — see {@link wrapTextRuns}. */
  children?: MiniChildren
}

/**
 * Something that takes the user somewhere else.
 *
 * On the web this is a real `<a href>`, which is worth more than it sounds:
 * middle-click, open-in-new-tab, copy-link, and a crawler all work without the
 * app doing anything, and none of them can be re-synthesised convincingly onto
 * a tap handler.
 *
 * Like {@link Button} it states `focusable`, for the same reason — an `<a href>`
 * is in the focus order for free and a native view with a link role is not.
 *
 * There is no navigation here, deliberately. Intercepting a press to drive a
 * router needs a router, and this package does not have one yet; when it does,
 * that component composes over this one rather than replacing it.
 */
export const Link = (props: LinkProps): HostElement => {
  const { children, focusable, ...rest } = props
  return jsx('view', {
    ...rest,
    role: 'link',
    focusable: focusable ?? true,
    children: wrapTextRuns(children),
  })
}
