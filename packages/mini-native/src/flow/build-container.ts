import { applyProp } from '../apply-prop'
import { requireHost } from '../current-host'
import type { ElementTag, Role } from '../elements'
import type { ClassValue, HostElement, MaybeReactive, StyleValue } from '../types'
import { warn } from '../warn'

/** The container-shaping props the collection components share. */
export type ContainerProps = {
  /**
   * Render rows into a real element of this tag instead of the default flow
   * wrapper. Reach for it when the container itself needs to be styled or to
   * lay its rows out directly — a `scroll-view` of rows being the common case.
   */
  as?: ElementTag
  /** Class for the `as` container. Ignored when `as` is not set. */
  class?: MaybeReactive<ClassValue>
  /** Style for the `as` container. Ignored when `as` is not set. */
  style?: MaybeReactive<StyleValue | null>
  /**
   * What the container IS. Requires `as`, because the default wrapper is
   * deliberately invisible to assistive technology and giving it a role would
   * contradict that — see the invariant on `Host.createFlowHost`.
   *
   * This is how an accessible collection is written, and both props are needed:
   *
   * ```tsx
   * <For each={rows} as="view" role="list">
   *   {(row) => <view role="listitem">…</view>}
   * </For>
   * ```
   */
  role?: Role
  /** The accessible name for the `as` container. Ignored when `as` is not set. */
  label?: MaybeReactive<string>
  /** Called with the container once built — the escape hatch for wiring it directly. */
  ref?: (element: HostElement) => void
}

/**
 * Builds the element rows are reconciled into: the shared flow wrapper by
 * default, or a real element of the requested tag with `class`, `style`, `role`,
 * `label`, and `ref` applied exactly as they would be on any other element.
 *
 * Shared by `For` and `Index` because the container is the one thing the two
 * genuinely have in common — they differ only in how a row is identified, and
 * duplicating the container handling would let the two drift apart on which
 * props they honour.
 */
export const buildContainer = (props: ContainerProps): HostElement => {
  const host = requireHost()

  if (props.as === undefined) {
    // Silently dropping the role would leave a list that reads as a plain group
    // to a screen reader while looking correct in the source — the failure mode
    // this whole layer exists to remove, so it is reported rather than ignored.
    if (props.role !== undefined) {
      warn('`role` on a collection needs an `as` container: the default flow wrapper is presentational.')
    }
    return host.createFlowHost()
  }

  // `role` goes in at creation as well as being applied below, because it
  // decides what some hosts BUILD rather than how the built element behaves.
  const container = host.createElement(props.as, { role: props.role })
  if (props.class !== undefined) applyProp(container, 'class', props.class)
  if (props.style !== undefined) applyProp(container, 'style', props.style)
  if (props.role !== undefined) applyProp(container, 'role', props.role)
  if (props.label !== undefined) applyProp(container, 'label', props.label)
  props.ref?.(container)
  return container
}
