import type { Dispose } from '../types'
import type { RouterHistory, RouterLocation } from './history'

/**
 * A navigation stack held in memory — the router's default history, and the
 * only one this package ships.
 *
 * "Memory history" usually means "the fake", and here it means the opposite,
 * which is worth saying plainly. A Lynx app has no address bar and no session
 * history shared with anything else: it has a stack of screens it owns
 * outright. So an in-memory stack is not a stand-in for the real thing, it IS
 * the real thing — and that the same object makes routing testable in plain
 * node, with no engine at all, is the same property paying twice.
 *
 * ```ts
 * const history = createMemoryHistory({ path: '/' })
 * const router = createRouter({ routes, history })
 * ```
 *
 * A hardware back gesture is wired by calling {@link RouterHistory.back}; the
 * router's `route` signal updates from there like any other navigation.
 */
export const createMemoryHistory = (initial: RouterLocation = { path: '/', search: '' }): RouterHistory => {
  const stack: RouterLocation[] = [initial]
  const listeners = new Set<() => void>()

  const notify = (): void => {
    // Iterate a copy so a listener unsubscribing itself cannot disturb the walk.
    for (const listener of [...listeners]) listener()
  }

  return {
    location: () => stack[stack.length - 1] as RouterLocation,

    push: (to) => {
      stack.push(to)
    },

    replace: (to) => {
      stack[stack.length - 1] = to
    },

    back: () => {
      // A no-op at the root rather than an error. Going back from the first
      // screen is an ordinary thing for a user to try, and on a device the
      // platform — not this stack — decides what happens next.
      if (stack.length <= 1) return
      stack.pop()
      // This one DOES notify, unlike push and replace: those are called through
      // the router, which already knows to refresh, while `back` is also what a
      // hardware gesture calls from outside.
      notify()
    },

    depth: () => stack.length - 1,

    subscribe: (listener): Dispose => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
