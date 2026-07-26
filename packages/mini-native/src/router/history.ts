import type { Dispose } from '../types'

/** Where the app is: a path, plus the query string that came with it. */
export type RouterLocation = {
  /** The path, with no query and no base prefix. Always starts with `/`. */
  readonly path: string
  /** The query string including its leading `?`, or `''` when there is none. */
  readonly search: string
}

/**
 * How navigation actually happens on a target — the one part of routing that
 * has no portable answer.
 *
 * Matching a pattern against a path is string arithmetic and ports for nothing.
 * *Moving between locations* does not: a browser has an address bar, a back
 * button, and a session history the user shares with every other tab; a device
 * has a navigation stack the app owns outright, and nothing the user can type
 * into. Those are different enough that pretending otherwise is how a router
 * ends up with a `window` reference in the middle of a screen.
 *
 * So the router takes one of these rather than reaching for a platform. The
 * package ships an in-memory implementation, which is the right shape for a
 * device *and* for a test; the browser one lives on its own entry so that
 * importing the router never drags a browser assumption along.
 */
export type RouterHistory = {
  /** Where the app is right now. */
  location: () => RouterLocation
  /** Go somewhere new, leaving the current entry behind to come back to. */
  push: (to: RouterLocation) => void
  /** Go somewhere new, forgetting the current entry — a redirect, not a step. */
  replace: (to: RouterLocation) => void
  /** Go back one entry. A no-op at the root, rather than an error. */
  back: () => void
  /**
   * How many entries this history has pushed and not yet popped, so `0` is the
   * place the app started.
   *
   * This exists instead of a `canGoBack` flag because it is a question with an
   * honest answer on both targets. A browser cannot say whether going back
   * would leave the app entirely — `history.length` counts entries from other
   * pages too — but it can count the ones this router pushed, which is exactly
   * what a back chevron should be shown for.
   */
  depth: () => number
  /**
   * Called when the location changed from OUTSIDE — a browser back button, a
   * deep link, a hardware back gesture. Navigation through this object does not
   * fire it, since the caller already knows.
   */
  subscribe: (listener: () => void) => Dispose
}
