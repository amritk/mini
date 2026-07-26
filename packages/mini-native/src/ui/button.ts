import { jsx } from '../jsx-runtime'
import type { HostElement, MaybeReactive, MiniChildren } from '../types'
import type { Forwarded } from './forwarded'
import { wrapTextRuns } from './wrap-text-runs'

/** What every button accepts, before the `as` override narrows the rest. */
type ButtonBase = Forwarded<'view'> & {
  /** The label. A bare text run is fine — see {@link wrapTextRuns} for why that is this layer's job. */
  children?: MiniChildren
}

/**
 * Props for {@link Button}.
 *
 * The union is the `as` override doing its one job: `href` exists on the link
 * arm and is unsayable on the other, so a button that points somewhere has to
 * admit it is a link. Polymorphism that cannot break the invariant it is
 * overriding.
 */
export type ButtonProps =
  | (ButtonBase & {
      /** Stays a button. */
      as?: 'button'
      href?: never
    })
  | (ButtonBase & {
      /**
       * Looks like a button, IS a link — the case every design system hits, and
       * the reason `as` exists.
       *
       * Note what it accepts: a ROLE, never an HTML tag. `as="a"` means nothing
       * on a device, and letting a tag in through a prop meant to describe
       * semantics is the hole through which web-only code re-enters a component
       * written for both targets.
       *
       * The accepted set is narrowed to what stays coherent. `as="heading"` is
       * absent because a focusable heading with a tap handler is meaningless on
       * both targets — the component would keep its name and lose its promise.
       */
      as: 'link'
      /** Where it points. The DOM host puts it on a real `<a>`, so middle-click and open-in-new-tab work. */
      href?: MaybeReactive<string>
    })

/**
 * Something the user can activate.
 *
 * The DOM host builds a real `<button>` (or an `<a href>` under `as="link"`),
 * so focus order, Enter and Space activation, and form submission are the
 * browser's rather than re-synthesised from keydown handlers that would be
 * subtly wrong. A native host reports the matching accessibility role.
 *
 * It also states `focusable`, which is the part worth knowing about, because
 * the targets do not agree without it. A `<button>` is reachable by keyboard
 * having been asked nothing at all, while a Lynx view with a button role is
 * reachable only when `focusable` says so — so a component that stayed silent
 * would be operable on the web and unreachable on a device, and both hosts
 * would be behaving correctly. This is exactly the portable knowledge §6.1 of
 * the cross-platform note wanted centralised: easy to get wrong, invisible when
 * you do, and worth writing down once. Pass `focusable={false}` to opt out for
 * the rare button that is reached some other way.
 */
export const Button = (props: ButtonProps): HostElement => {
  const { as, children, focusable, ...rest } = props
  return jsx('view', {
    ...rest,
    role: as ?? 'button',
    focusable: focusable ?? true,
    children: wrapTextRuns(children),
  })
}
