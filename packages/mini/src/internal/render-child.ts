import { computed, effect, effectScope } from 'alien-signals'

import { onCleanup } from '../on-cleanup'
import { runDetached } from '../run-detached'

/** Builds the node to display, or returns `null` to display nothing. */
export type ChildFactory = () => Node | null

/**
 * Keeps `host`'s children equal to whatever `select` currently resolves to —
 * the reactive single-slot swap every flow component is built on.
 *
 * The swap must fire only when `select` picks a *different* factory, not on every
 * signal it happens to read. A derived condition can change without changing
 * which branch wins — `Show when={() => count() > 5}` re-evaluates on every
 * `count` tick yet stays on the same branch from 6 to 7 — and rebuilding then
 * would dispose the branch's scope (firing its `onCleanup`s) and
 * `replaceChildren` the same node back in, blurring a focused input and losing
 * scroll/selection in a subtree that did not logically change.
 *
 * So `select` runs inside a `computed`, which dedupes on the returned factory:
 * the swap effect subscribes to that computed and re-runs only when the factory
 * reference actually changes. Crucially, this also keeps the mounted branch's
 * own bindings alive across an unchanged selection. alien-signals disposes an
 * effect's child scopes when that effect re-runs, so gating with an early
 * `return` inside the effect would leave the branch scope disposed but not
 * rebuilt — its bindings would silently stop reacting. Not re-running the effect
 * at all is what avoids that: the branch scope is only ever torn down on a real
 * flip, right before the next one is built.
 *
 * The branch itself is built DETACHED — `runDetached` around the `effectScope`,
 * exactly as `list` builds a row — and that is load-bearing twice over, which is
 * why it is not left to the engine even though the engine would nearly do it.
 *
 * The first reason is dependencies, and it is the one that bites. A component
 * body runs inside this effect, so any signal it reads SYNCHRONOUSLY while
 * building — not inside one of its own bindings, but in the body itself, the way
 * `createQuery` reads its options getter to seed the observer — would be
 * recorded as a dependency of the swap effect. Writing that signal would then
 * re-run the swap, rebuild the branch from scratch, and hand the component a
 * fresh set of local signals: state silently resets on a change that selected no
 * new branch at all. Detaching means only `select` decides when the branch is
 * rebuilt, which is the whole contract of this function.
 *
 * The second is ownership. alien-signals disposes a scope created inside an
 * effect when that effect re-runs, so leaving the branch attached would make its
 * teardown a side effect of the swap rather than something this function
 * controls. Detaching hands the lifetime back here: `dispose?.()` tears the
 * outgoing branch down on a real flip, and the `onCleanup` below tears the last
 * one down when the enclosing component unmounts — which is what keeps `Show`
 * and friends free to ignore the returned teardown without leaking a branch.
 */
export const renderChild = (host: Element, select: () => ChildFactory | null): (() => void) => {
  let dispose: (() => void) | null = null
  // The selection, memoised on the factory reference. The effect below tracks
  // this computed, so it re-runs only when the chosen factory changes — never on
  // an unrelated signal the condition happens to read.
  const selected = computed(select)
  const stop = effect(() => {
    const factory = selected()
    // Tear down the branch we are replacing before building the next one.
    dispose?.()
    // effectScope runs its body synchronously; the assignment is definite,
    // just invisible to the compiler — hence the initialiser plus reassignment.
    let node: Node | null = null
    dispose = runDetached(() =>
      effectScope(() => {
        node = factory ? factory() : null
      }),
    )
    if (node) host.replaceChildren(node)
    else host.replaceChildren()
  })

  const tearDown = (): void => {
    stop()
    dispose?.()
    dispose = null
  }

  // The branch scope is detached from the swapping effect, so the enclosing
  // scope has to be told about it explicitly — otherwise a component unmounting
  // would leave its last-rendered branch still reacting.
  onCleanup(tearDown)

  return tearDown
}
