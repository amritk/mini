import type { Dispose } from '../types'

/** Where the app is: a path, plus the query string that came with it. */
export type RouterLocation = {
  /** The path, with no query and no base prefix. Always starts with `/`. */
  readonly path: string
  /** The query string including its leading `?`, or `''` when there is none. */
  readonly search: string
}

/**
 * How navigation actually happens — the one part of routing that is not just
 * arithmetic over strings.
 *
 * Matching a pattern against a path has nothing underneath it. *Moving between
 * locations* does: a device has a navigation stack the app owns outright, and
 * nothing the user can type into, while the back gesture that unwinds it is a
 * platform affordance arriving from outside the app. A router that assumed
 * either shape would be a router with the wrong one wired into every screen.
 *
 * So the router takes one of these instead. {@link createMemoryHistory} is the
 * default and is a complete implementation rather than a stand-in — an app's
 * screen stack genuinely is a stack it holds — and this type stays a seam so
 * that an app embedding Lynx inside a host that owns navigation (a tab bar it
 * did not write, a native shell it is one screen of) can hand its own in.
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
   * This exists instead of a `canGoBack` flag because it is the question a
   * history can always answer honestly. Whether going back would leave the app
   * entirely is up to whatever hosts it, but how many steps the app has taken
   * since it started is its own business — and that is exactly what a back
   * chevron should be shown for.
   */
  depth: () => number
  /**
   * Called when the location changed from OUTSIDE — a hardware back gesture, a
   * deep link, a host shell popping a screen. Navigation through this object
   * does not fire it, since the caller already knows.
   */
  subscribe: (listener: () => void) => Dispose
}
