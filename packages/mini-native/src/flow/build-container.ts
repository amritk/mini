import { applyProp } from '../apply-prop'
import type { LynxElement } from '../engine/element-api'
import { createElement, createWrapper } from '../tree'
import type { IntrinsicElements } from '../vocabulary'

/** Any tag the vocabulary knows, which is any tag the engine builds. */
export type ContainerTag = keyof IntrinsicElements & string

/**
 * The container-shaping props the collection components share, parameterised by
 * the tag so the container's own props are checked against the real element.
 *
 * `<For as="scroll-view" scroll-orientation="horizontal">` typechecks against
 * Lynx's actual `scroll-view` props, and a misspelling is an error rather than
 * an attribute the engine ignores. That is only possible because the vocabulary
 * is the engine's own; a curated subset would have had to name every prop it was
 * willing to forward, and would then be the thing standing between an app and a
 * capability the engine already has.
 */
export type ContainerProps<Tag extends ContainerTag = 'wrapper'> = {
  /**
   * Render rows into a real element of this tag instead of the default wrapper.
   *
   * Reach for it when the container itself needs to be styled, to scroll, or to
   * carry accessibility semantics — a `scroll-view` of rows being the common
   * case, and `<list>` being the one to reach for when the collection is long
   * enough to need recycling.
   */
  as?: Tag
  /** Called with the container once built — the escape hatch for wiring it directly. */
  ref?: (element: LynxElement) => void
} & Omit<IntrinsicElements[Tag], 'children' | 'ref' | 'key'>

/**
 * Builds the element rows are reconciled into: a `wrapper` by default, or a
 * real element of the requested tag with every prop applied exactly as it would
 * be on any other element.
 *
 * Shared by `For` and `Index` because the container is the one thing the two
 * genuinely have in common — they differ only in how a row is identified, and
 * duplicating the container handling would let them drift apart on which props
 * they honour.
 *
 * ## Why the default is a `wrapper` and not a `view`
 *
 * Control flow needs to own a slot in the tree, and that slot must not change
 * what the tree MEANS. A `view` would: it takes part in layout, so a `For`
 * inside a flex row silently becomes one flex item instead of many, and it
 * takes part in the accessibility tree, so it sits between a list and its items
 * and breaks the relationship.
 *
 * Lynx has a first-class element for exactly this — `wrapper`, a grouping node
 * that is transparent to both — so the problem is solved by using the engine's
 * own answer rather than by working around its absence. It is a good example of
 * what this runtime gets for free by not inventing a vocabulary: the old
 * multi-target version had to create a container view and then mark it
 * `accessibility-element="false"` to approximate this, on every host, and hope
 * layout did not notice.
 */
export const buildContainer = <Tag extends ContainerTag>(props: ContainerProps<Tag>): LynxElement => {
  const { as, ref, ...rest } = props as ContainerProps<ContainerTag> & { readonly [prop: string]: unknown }

  if (as === undefined) return createWrapper()

  const container = createElement(as)
  for (const [name, value] of Object.entries(rest)) {
    // `each` and `children` belong to the collection component rather than to
    // its container, and forwarding them would write two junk attributes onto
    // the element — visible in a devtool and confusing in a bug report.
    if (name === 'each' || name === 'children' || name === 'key') continue
    applyProp(container, name, value)
  }
  ref?.(container)
  return container
}
