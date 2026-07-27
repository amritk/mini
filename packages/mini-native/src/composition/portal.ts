import { requireHost, scheduleFlush } from '../current-host'
import { onCleanup } from '../on-cleanup'
import type { HostElement } from '../types'

/** Props for {@link Portal}. */
export type PortalProps = {
  /**
   * Where the children go. An element the app owns — usually an overlay root
   * created next to the app root at the entry point.
   */
  target: HostElement
  /**
   * The subtree to move. Built where it is WRITTEN, so it reads whatever
   * context surrounds the `Portal` rather than whatever surrounds the target —
   * which is what makes a themed modal work without threading the theme
   * through the overlay root.
   */
  children: HostElement
}

/**
 * Renders a subtree somewhere else in the tree.
 *
 * Modals, sheets, toasts, and tooltips all need to escape their parent — its
 * overflow, its stacking, its transforms — and they need it on both targets.
 *
 * The target is passed IN rather than discovered, and that is the design
 * decision worth explaining. The tempting alternative is a host-provided
 * overlay root, which would mean a new method on the `Host` contract and a
 * per-target answer to "where is the top of the screen" — a question the host
 * would have to guess at and the app already knows, because the app wrote its
 * own shell. Handing it over explicitly keeps the contract at its current size
 * and keeps composition explicit, which is the rule the rest of the package
 * follows anyway.
 *
 * ```tsx
 * // at the entry point
 * const overlays = <view /> as HostElement
 * host.insert(appRoot, overlays, null)
 *
 * // anywhere in the tree
 * <Portal target={overlays}>
 *   <Sheet onClose={close} />
 * </Portal>
 * ```
 *
 * What stays behind is an empty presentational wrapper, so the portal still
 * occupies a place in the tree it was written in — which is what ties the
 * subtree's LIFETIME to that place. Unmount the component that wrote the
 * portal and the moved subtree is removed with it, rather than being orphaned
 * in the overlay root with its bindings still live.
 */
export const Portal = (props: PortalProps): HostElement => {
  const host = requireHost()
  const node = props.children

  host.insert(props.target, node, null)
  scheduleFlush()

  // The subtree lives in another parent but belongs to this scope, so leaving
  // the tree has to take it along. Without this a portal would survive its own
  // component, which on a native target means a sheet that cannot be dismissed.
  onCleanup(() => {
    host.remove(node)
    scheduleFlush()
  })

  return host.createFlowHost()
}
