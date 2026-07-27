import { requireHost } from './current-host'
import type { HostElement } from './types'

/**
 * Moves keyboard focus to an element, or takes it away.
 *
 * Focus is a call rather than a prop, and the reason is worth knowing because
 * it is the sort of API that looks wrong until it is explained. A
 * `focused={true}` prop has no correct meaning the moment the user taps
 * somewhere else: the prop still says `true`, the element is not focused, and
 * nothing can honestly reconcile the two. Focusing is something that HAPPENS,
 * not a state an element holds.
 *
 * Reach for it through `ref`, which is the seam for anything imperative:
 *
 * ```tsx
 * let email: HostElement
 * <input ref={(element) => { email = element }} onSubmit={() => focus(password)} />
 * ```
 *
 * Both are no-ops on a target with no notion of focus, rather than errors — a
 * headless host should not have to fake one, and an app should not have to
 * branch on whether it might be running against one.
 *
 * For focusing something the moment it is built, prefer `autoFocus`, which
 * takes care of waiting until the element is actually in the tree.
 */
export const focus = (element: HostElement): void => {
  requireHost().focus?.(element)
}

/** Takes keyboard focus away from an element. See {@link focus}. */
export const blur = (element: HostElement): void => {
  requireHost().blur?.(element)
}
