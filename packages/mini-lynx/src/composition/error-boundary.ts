import { currentFrame, withFrame } from '../context-frame'
import { onCleanup } from '../on-cleanup'
import { runDetached } from '../run-detached'
import { effectScope } from '../signals'
import { clear, createWrapper, insert } from '../tree'
import type { Dispose, LynxElement } from '../types'

/** Props for {@link ErrorBoundary}. */
export type ErrorBoundaryProps = {
  /**
   * The subtree to guard. A FUNCTION, because an already-built element would
   * have thrown as an argument — before this component ever ran — and there
   * would be nothing left to catch.
   */
  children: () => LynxElement
  /**
   * What to render instead. `retry` rebuilds the subtree from scratch, which is
   * the right offer for a failure that might not repeat (a screen whose data
   * fetch threw) and pointless for one that will.
   */
  fallback: (error: unknown, retry: () => void) => LynxElement
}

/**
 * Renders `fallback` when building `children` throws.
 *
 * The failure mode is the argument for this, rather than the feature. A
 * component here runs exactly once, so a throw part-way through leaves a
 * half-built tree with no second render to recover on — and on a device that is
 * a dead app and a crash report, not a blank area and a message in a console
 * somebody has open. There is no reload to fall back on either, which is why
 * `retry` is part of the shape rather than an extra.
 *
 * ```tsx
 * <ErrorBoundary fallback={(error, retry) => <Failed error={error} bindtap={retry} />}>
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
export const ErrorBoundary = (props: ErrorBoundaryProps): LynxElement => {
  const wrapper = createWrapper()
  // Captured now, restored around every attempt — a retry happens long after
  // this component returned, by which time any provider around it has gone.
  const frame = currentFrame()
  let dispose: Dispose | null = null

  const attempt = (): void => {
    dispose?.()
    let node: LynxElement | null = null
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
    clear(wrapper)
    if (node) insert(wrapper, node, null)
  }

  attempt()
  onCleanup(() => dispose?.())

  return wrapper
}
