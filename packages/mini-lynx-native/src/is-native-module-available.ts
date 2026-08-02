import { sendCall } from './channel'

/**
 * Answers whether a native module is linked into this build — and, when
 * `method` is given, whether that method is on it.
 *
 * Feature detection matters more here than it does on the web, because a Lynx
 * native module is linked by the *host app*, not by the JavaScript bundle. The
 * same bundle can run inside a host that has the module and a host that does
 * not, and the difference is invisible until something calls it. Checking first
 * turns "the button does nothing" into a branch you wrote on purpose.
 *
 * Prefer this to catching a rejection from `callNative` when the answer changes
 * what the UI *shows* rather than what it does — a capability the host lacks
 * usually means hiding a control, not failing when it is pressed.
 *
 * @example
 * ```ts
 * if (await isNativeModuleAvailable('MiniLynxNotificationsModule')) {
 *   // safe to offer the notifications screen
 * }
 * ```
 */
export const isNativeModuleAvailable = (module: string, method = ''): Promise<boolean> =>
  sendCall(module, method, [], 'exists') as Promise<boolean>
