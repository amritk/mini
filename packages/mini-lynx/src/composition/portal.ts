import { onCleanup } from '../on-cleanup'
import { createWrapper, insert, remove } from '../tree'
import type { LynxElement } from '../types'

/** Props for {@link Portal}. */
export type PortalProps = {
  /**
   * Where the children go. An element the app owns — usually an `<overlay>` (or
   * a plain `<view>`) created next to the app root at the entry point.
   */
  target: LynxElement
  /**
   * The subtree to move. Built where it is WRITTEN, so it reads whatever
   * context surrounds the `Portal` rather than whatever surrounds the target —
   * which is what makes a themed modal work without threading the theme
   * through the overlay root.
   */
  children: LynxElement
}

/**
 * Renders a subtree somewhere else in the tree.
 *
 * Modals, sheets, toasts, and tooltips all need to escape their parent — its
 * clipping, its stacking, its transforms — and none of that is expressible from
 * inside the parent.
 *
 * The target is passed IN rather than discovered, and that is the design
 * decision worth explaining. The tempting alternative is for the runtime to
 * nominate an overlay root of its own, which means answering "where is the top
 * of the screen" on the app's behalf — a question the runtime would have to
 * guess at and the app already knows, because the app wrote its own shell.
 * Lynx's `<overlay>` is usually the right answer, and it is the app that knows
 * whether it has one.
 *
 * ```tsx
 * // at the entry point
 * const overlays = <overlay style={{ position: 'fixed' }} />
 * insert(appRoot, overlays, null)
 *
 * // anywhere in the tree
 * <Portal target={overlays}>
 *   <Sheet onClose={close} />
 * </Portal>
 * ```
 *
 * What stays behind is an empty wrapper, so the portal still occupies a place
 * in the tree it was written in — which is what ties the subtree's LIFETIME to
 * that place. Unmount the component that wrote the portal and the moved subtree
 * is removed with it, rather than being orphaned in the overlay root with its
 * bindings still live. A wrapper is exactly the right node for that: it holds a
 * place without taking part in layout or in the accessibility tree, so nothing
 * about the portal is visible to a screen reader walking the tree it was
 * written in.
 */
export const Portal = (props: PortalProps): LynxElement => {
  const node = props.children

  insert(props.target, node, null)

  // The subtree lives in another parent but belongs to this scope, so leaving
  // the tree has to take it along. Without this a portal would survive its own
  // component, which means a sheet that cannot be dismissed.
  onCleanup(() => remove(node))

  return createWrapper()
}
