/**
 * `@amritk/mini-lynx/elements` — reaching an element, and calling a method on it.
 *
 * Two capabilities that share one property: they are the parts of the engine
 * that are **not** attributes, and so are not something a signal can be bound
 * to. Everything else in this runtime is declarative because the engine's
 * surface is; these are the exceptions, and they are imperative because what
 * they express is an action with a moment and a result rather than a piece of
 * state.
 *
 * - `querySelector` / `querySelectorAll` reach an element you did not build.
 * - `invoke` calls one of the engine's UI methods on it.
 *
 * They are on a subpath rather than in `.` because most apps need neither. A
 * component holds a reference to every element it built, and `ref` hands one
 * over at build time — cheaper than a selector and impossible to leave stale —
 * so reaching for this module should feel like a decision.
 *
 * @example
 * ```ts
 * import { invoke, querySelector } from '@amritk/mini-lynx/elements'
 *
 * const list = querySelector('#feed')
 * if (list) await invoke(list, 'scrollToPosition', { position: 0, smooth: true })
 * ```
 */

export { invoke } from './invoke'
export { querySelector, querySelectorAll } from './query'
