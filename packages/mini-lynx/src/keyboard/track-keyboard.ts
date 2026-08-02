import { guard } from '../report-error'
import type { Dispose } from '../types'
import { warn } from '../warn'
import { setKeyboardHeight } from './keyboard-height'

/** Whether the keyboard came up or went away. The engine's own two values. */
export type KeyboardStatus = 'on' | 'off'

/**
 * The engine's `keyboardstatuschanged` payload, spread across three arguments
 * the way `GlobalEventEmitter` delivers it.
 *
 * `compatHeight` is the engine's compatibility height and is deliberately
 * ignored here — it exists for hosts that measure the keyboard differently, and
 * picking between the two on an app's behalf would be guessing. An app that
 * knows its host needs the other number can subscribe itself and call
 * {@link setKeyboardHeight}.
 */
export type KeyboardStatusListener = (status: KeyboardStatus, height: number, compatHeight?: number) => void

/**
 * The slice of Lynx's `GlobalEventEmitter` this module uses.
 *
 * Declared here rather than imported from `@lynx-js/types` for the same reason
 * `entry.ts` declares its own view of `lynx.__globalProps`: this must work
 * whether or not the types-only peer is installed, and the shape is two methods.
 */
export type KeyboardEmitter = {
  addListener: (event: string, listener: KeyboardStatusListener) => void
  removeListener: (event: string, listener: KeyboardStatusListener) => void
}

/** Options for {@link trackKeyboard}. */
export type TrackKeyboardOptions = {
  /**
   * Where keyboard changes come from. Defaults to the engine's own
   * `GlobalEventEmitter`, which is what a device build wants.
   *
   * Pass your own for the two hosts that do not have one. **The web is the
   * important one**: Lynx's compatibility data lists `keyboardstatuschanged` as
   * unsupported on `web_lynx`, so a page running this runtime through a DOM
   * Element PAPI never hears from the engine at all and has to report the
   * keyboard from `visualViewport` instead. A test is the other.
   */
  emitter?: KeyboardEmitter
}

/** The engine's event name. Spelled the way the engine spells it, like everything else here. */
const EVENT = 'keyboardstatuschanged'

/**
 * Subscribes to the engine's keyboard reporting and feeds {@link keyboardHeight}.
 *
 * Call it once, at startup, next to `setEngine`. Returns a stop function, which
 * an ordinary app never needs — the subscription lives as long as the page —
 * but a test does.
 *
 * ```ts
 * setEngine(globalEngine())
 * trackKeyboard()
 * ```
 *
 * ## Why this is not claimed by `renderPage`
 *
 * Because it costs bytes an app that has no text input should not pay. Every
 * other "the platform pushes this at us" value in the package — global props,
 * the error handler — is core and is claimed for you; this one lives on an
 * opt-in subpath, so wiring it up is the app's one line. The import boundary
 * test is what keeps that honest.
 *
 * ## What arrives, and what does not
 *
 * The height the engine reports is measured from the bottom of the SCREEN, not
 * from the bottom of the Lynx view. On a full-screen app those are the same
 * edge and everything downstream is exact. On an app whose view stops above a
 * navigation bar they differ by that bar's height, and the difference is what
 * {@link KeyboardAvoidingProps.inset} is for.
 *
 * A host with no emitter is a warning rather than a throw, and the app renders
 * with the keyboard permanently reported as closed. That is the honest failure:
 * an app that cannot hear about the keyboard has a layout problem, not a reason
 * to refuse to start.
 */
export const trackKeyboard = (options: TrackKeyboardOptions = {}): Dispose => {
  const emitter = options.emitter ?? engineEmitter()

  if (!emitter) {
    warn(
      `this host has no GlobalEventEmitter, so the keyboard cannot be tracked — pass an emitter to trackKeyboard() if the host reports the keyboard another way`,
    )
    return () => {}
  }

  // Entered from the platform rather than from an app's own call stack, so it
  // owes the same guard every other engine-called callback here does: a throw
  // out of this one unwinds into native dispatch, where there is nothing
  // listening and no defined behaviour.
  const listener: KeyboardStatusListener = (status, height) => {
    guard('event', () => setKeyboardHeight(status === 'on' ? height : 0))
  }

  emitter.addListener(EVENT, listener)

  return () => {
    emitter.removeListener(EVENT, listener)
    // A page that has stopped listening cannot learn that the keyboard closed,
    // so leaving the last height behind would strand every layout reading it in
    // a permanently raised position.
    setKeyboardHeight(0)
  }
}

/**
 * The engine's emitter, or `undefined` on a host that has none.
 *
 * Read off the global through `unknown` rather than imported, because
 * `getJSModule` is a runtime capability of the platform and this package
 * compiles with no platform library at all.
 */
const engineEmitter = (): KeyboardEmitter | undefined => {
  const lynx = (globalThis as unknown as LynxRuntimeGlobal).lynx
  return lynx?.getJSModule?.('GlobalEventEmitter')
}

/** The one thing this file reads off the `lynx` object. */
type LynxRuntimeGlobal = {
  lynx?: { getJSModule?: (name: string) => KeyboardEmitter | undefined }
}
