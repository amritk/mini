import { warn } from './warn'

/**
 * Where a throw that escaped app code was caught, so a report says which of the
 * runtime's boundaries it crossed rather than only what went wrong.
 *
 * These are the four places this runtime is the outermost JavaScript frame —
 * the engine called in, or the job queue did, and there is no caller above to
 * hand the failure to.
 */
export type ErrorSource =
  /** Building the tree: `mount`, or the entry point's first render. */
  | 'render'
  /** An event handler, running inside the engine's own dispatch. */
  | 'event'
  /** A gesture callback, which reaches us through the same dispatch. */
  | 'gesture'
  /** The scheduled commit, running on the promise job queue. */
  | 'commit'
  /** A lifecycle slot the engine calls: teardown before a reload, global props arriving. */
  | 'lifecycle'

/** What an app registers to hear about failures the runtime caught. */
export type ErrorHandler = (error: unknown, source: ErrorSource) => void

let handler: ErrorHandler | undefined

/**
 * Routes every error the runtime catches to your crash reporter.
 *
 * ## Why the runtime catches at all
 *
 * `ErrorBoundary` covers construction, which is the whole of what a component
 * can throw during — a component runs once and is finished. Everything after
 * that runs with the runtime as the outermost frame, and the frames above it
 * are native:
 *
 * - a handler throws **inside the engine's dispatch**, and a JavaScript
 *   exception unwinding into native event delivery is not a defined outcome —
 *   on a device it ranges from the rest of the frame's listeners never running
 *   to the app going down;
 * - the scheduled commit throws **on the promise job queue**, so it becomes an
 *   unhandled rejection, and Lynx's main-thread context is exactly the sort of
 *   restricted environment where nothing is listening for one.
 *
 * Both are silent by default, which is the failure mode this package works
 * hardest to avoid everywhere else. So the runtime contains the throw at each
 * of those boundaries and reports it — one screen misbehaves instead of the app
 * disappearing, and the report is the thing that tells you it happened.
 *
 * ## Why it does not rethrow
 *
 * Because there is nowhere useful to throw *to*. Rethrowing hands the exception
 * back to native code that did not ask for one; swallowing it silently would be
 * worse than the crash. Reporting is the third option and the only one that
 * keeps both the frame and the evidence.
 *
 * With no handler installed the error goes to `warn`, so a mistake is visible in
 * development without any setup. Install one in production and send it wherever
 * your other crashes go.
 *
 * @example
 * ```ts
 * // Once, at startup — before renderPage, so a failed first build is reported too.
 * setErrorHandler((error, source) => Sentry.captureException(error, { tags: { source } }))
 * ```
 */
export const setErrorHandler = (next: ErrorHandler | null | undefined): void => {
  handler = next ?? undefined
}

/**
 * Reports an error the runtime caught, without letting the report itself fail.
 *
 * A handler that throws is a real possibility — it is app code, often the first
 * thing to run after something already went wrong — and a throw from in here
 * would land back in exactly the native frame the catch was protecting. So the
 * reporter is itself guarded, and its failure falls through to `warn` alongside
 * the original.
 */
export const reportError = (error: unknown, source: ErrorSource): void => {
  if (!handler) {
    warn(`unhandled error while handling ${source}:`, error)
    return
  }
  try {
    handler(error, source)
  } catch (failure) {
    warn(`the error handler threw while reporting a ${source} error:`, failure)
    warn(`the original ${source} error was:`, error)
  }
}

/**
 * Runs `fn`, reporting a throw instead of propagating it.
 *
 * Returns whether it completed, because two callers need to know: the entry
 * point still has to tell the platform the first screen is up even when the
 * build failed, and a fan-out of handlers wants to keep going after one of them
 * threw.
 */
export const guard = (source: ErrorSource, fn: () => void): boolean => {
  try {
    fn()
    return true
  } catch (error) {
    reportError(error, source)
    return false
  }
}
