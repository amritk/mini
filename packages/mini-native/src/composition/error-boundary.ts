import { currentFrame, withFrame } from '../context-frame'
import { requireHost, scheduleFlush } from '../current-host'
import { onCleanup } from '../on-cleanup'
import { runDetached } from '../run-detached'
import { effectScope } from '../signals'
import type { Dispose, HostElement } from '../types'

/** Props for {@link ErrorBoundary}. */
export type ErrorBoundaryProps = {
  /**
   * The subtree to guard. A FUNCTION, because an already-built element would
   * have thrown as an argument — before this component ever ran — and there
   * would be nothing left to catch.
   */
  children: () => HostElement
  /**
   * What to render instead. `retry` rebuilds the subtree from scratch, which is
   * the right offer for a failure that might not repeat (a screen whose data
   * fetch threw) and pointless for one that will.
   */
  fallback: (error: unknown, retry: () => void) => HostElement
}

/**
 * Renders `fallback` when building `children` throws.
 *
 * The cross-platform angle is the failure mode rather than the feature. A
 * component here runs exactly once, so a throw part-way through leaves a
 * half-built tree with no second render to recover on — and what that looks
 * like differs sharply per target. On the web it is a blank area and a message
 * in a console nobody has open; on a device it is a dead app and a crash
 * report. The second is expensive enough that this should not wait behind the
 * ergonomics work.
 *
 * ```tsx
 * <ErrorBoundary fallback={(error, retry) => <Failed error={error} onTap={retry} />}>
 *   {() => <Dashboard />}
 * </ErrorBoundary>
 * ```
 *
 * **It catches construction, not everything.** This is the honest limit and it
 * follows from the runtime rather than from effort: a throw inside an effect
 * that runs three seconds later, in a handler, or in a promise, happens long
 * after every component finished running and there is no build in progress to
 * unwind. Those belong to the code that started them. What this covers is the
 * whole of the initial build and every rebuild a retry causes, which is where
 * a throw would otherwise take the tree with it.
 *
 * Each attempt gets its own scope, disposed before the next one starts, so a
 * retry cannot leave the failed attempt's bindings running — the same
 * per-subtree lifetime guarantee `list` gives each row and `renderChild` gives
 * each branch.
 */
export const ErrorBoundary = (props: ErrorBoundaryProps): HostElement => {
  const host = requireHost()
  const wrapper = host.createFlowHost()
  // Captured now, restored around every attempt — a retry happens long after
  // this component returned, by which time any provider around it has gone.
  const frame = currentFrame()
  let dispose: Dispose | null = null

  const attempt = (): void => {
    dispose?.()
    let node: HostElement | null = null
    dispose = runDetached(() =>
      effectScope(() => {
        withFrame(frame, () => {
          try {
            node = props.children()
          } catch (error) {
            // The fallback is built in the same scope as the attempt, so a
            // retry tears it down along with whatever the failed attempt had
            // managed to construct before it threw.
            node = props.fallback(error, attempt)
          }
        })
      }),
    )
    host.clear(wrapper)
    if (node) host.insert(wrapper, node, null)
    scheduleFlush()
  }

  attempt()
  onCleanup(() => dispose?.())

  return wrapper
}
