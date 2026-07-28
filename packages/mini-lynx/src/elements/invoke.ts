import { requireEngine, scheduleFlush } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'

/**
 * Calling a UI method on an element.
 *
 * Most of what an element can do is state, and state is an attribute this
 * runtime binds a signal to. A handful of capabilities are not state and cannot
 * be expressed as one — they are *actions*, with a moment and a result:
 * `scrollTo` on a scroller, `boundingClientRect` on anything laid out,
 * `scrollIntoView`, `setFocus`, `takeScreenshot`. Those go through here.
 *
 * The whole of this module is turning one engine convention into a JavaScript
 * one. `__InvokeUIMethod` reports through a callback with a numeric `code`,
 * where zero means success, and every other value means a failure whose only
 * description is the payload it came with. Left alone, every call site in every
 * app would rewrite that check, and most would get the "is it zero" polarity
 * backwards at least once. So it is written here, once.
 */

/**
 * Calls `method` on `element`, resolving with its result.
 *
 * Rejects when the engine reports a non-zero code — an unknown method, a method
 * the element does not implement, or one the platform does not support. The
 * rejection carries the engine's own payload rather than a summary of it,
 * because the method set is the engine's and this package does not know what
 * any given failure means.
 *
 * The method names and their parameter shapes are Lynx's, spelled the way Lynx
 * spells them, and are documented by the engine rather than here — the same
 * arrangement as attributes and events. `@lynx-js/types` declares the set as
 * `InvokeParams` if you want them checked.
 *
 * @example
 * ```ts
 * const rect = await invoke<{ width: number; height: number }>(card, 'boundingClientRect', {})
 * await invoke(scroller, 'scrollTo', { offset: 0, smooth: true })
 * ```
 */
export const invoke = <T = unknown>(
  element: LynxElement,
  method: string,
  params: Readonly<Record<string, unknown>> = {},
): Promise<T> => {
  const engine = requireEngine()
  if (!engine.__InvokeUIMethod) {
    throw new Error(`This engine has no __InvokeUIMethod, so "${method}" cannot be called.`)
  }
  return new Promise<T>((resolve, reject) => {
    engine.__InvokeUIMethod?.(element, method, { ...params }, (result) => {
      if (result.code === 0) resolve(result.data as T)
      else reject(new Error(`UI method "${method}" failed: ${describe(result)}`))
    })
    // A method may act on state this tick has only written to the pending tree —
    // scrolling to a row that was appended in the same handler is the ordinary
    // case — so the commit is scheduled alongside it rather than left to whatever
    // happens to flush next.
    scheduleFlush()
  })
}

/**
 * Renders a failed result for a message.
 *
 * `JSON.stringify` rather than the payload directly, because the engine's shape
 * varies by method and a template literal would render most of them as
 * `[object Object]` — which is the least useful possible thing to find in a log
 * when a UI method has failed on a device.
 */
const describe = (result: { readonly code: number; readonly data?: unknown }): string => {
  try {
    return JSON.stringify(result)
  } catch {
    return `code ${result.code}`
  }
}
