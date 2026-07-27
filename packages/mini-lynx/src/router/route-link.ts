import { addEvent } from '../add-event'
import { appendChildren } from '../append-children'
import { applyProp } from '../apply-prop'
import { onCleanup } from '../on-cleanup'
import { createElement } from '../tree'
import type { ClassValue, LynxElement, MaybeReactive, MiniChildren, StyleValue } from '../types'
import type { NavigateOptions } from './create-router'

/** Props for {@link RouteLink}. */
export type RouteLinkProps = {
  /** Where it goes. Reactive, so a link whose destination depends on state stays live. */
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
  /** Class for the link. */
  class?: MaybeReactive<ClassValue>
  /** Style for the link. */
  style?: MaybeReactive<StyleValue | null>
  /**
   * What the link announces. A `<text>` already defaults to its own content, so
   * this is only worth setting when the visible label does not read as a
   * destination on its own — "here", "read more".
   */
  label?: MaybeReactive<string>
  /** The link's contents. A bare string is fine, since this builds a `<text>`. */
  children?: MiniChildren
}

/**
 * A link that navigates through the router.
 *
 * It builds a `<text>`, and a tap navigates. That is the whole component, and
 * the brevity is the part worth explaining — because the web version of this
 * idea is anything but brief. There, a router link has to render a real
 * `<a href>` so that middle-click, open-in-new-tab and copy-link keep working,
 * and then intercept exactly the plain activations while leaving Cmd-, Ctrl-,
 * Shift- and middle-clicks to the browser. That filter is invisible when it is
 * wrong and gets reported as "your site is broken".
 *
 * None of it applies here. Lynx has nothing addressable to point AT, no default
 * navigation to prevent, and no modifier keys on a touch, so the tap is the
 * whole gesture and handling it is the whole job. An earlier version of this
 * package carried the web filter because it had a DOM target; it left with that
 * target rather than staying behind as defensive code for a case that can no
 * longer arise.
 *
 * A `<text>` rather than a `<view>` because a link is text far more often than
 * not, and because a bare string is only legal inside a `<text>` — Lynx has no
 * notion of loose text in a container. It still accepts nested `<view>`,
 * `<image>` and `<text>` children, so a link with an icon in it is expressible.
 *
 * ```tsx
 * <RouteLink to="/pricing" navigate={router.navigate}>Pricing</RouteLink>
 * ```
 */
export const RouteLink = (props: RouteLinkProps): LynxElement => {
  const element = createElement('text')
  const href = typeof props.to === 'function' ? props.to : (): string => props.to as string

  if (props.class !== undefined) applyProp(element, 'class', props.class)
  if (props.style !== undefined) applyProp(element, 'style', props.style)
  if (props.label !== undefined) applyProp(element, 'accessibility-label', props.label)

  // Stated rather than left to the default. `accessibility-element` is already
  // true for a `<text>`, but the trait is not: announced as prose, a link gives
  // a screen-reader user no reason to try activating it.
  applyProp(element, 'accessibility-element', true)
  applyProp(element, 'accessibility-traits', 'link')

  onCleanup(addEvent(element, 'bindEvent', 'tap', () => props.navigate(href(), { replace: props.replace ?? false })))

  appendChildren(element, props.children)

  return element
}
