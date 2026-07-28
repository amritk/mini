/**
 * @amritk/mini-lynx — a signals runtime for Lynx, with no virtual tree.
 *
 * JSX builds real Lynx elements, once. A function-valued prop or child becomes
 * a live binding; anything else is applied once and never looked at again.
 * Repetition goes through `list`, the only reconciler here. Nothing diffs,
 * nothing re-renders, and a component function runs exactly once.
 *
 * ## What this package is, and is not
 *
 * It is a **thin layer over Lynx**, not a framework with its own vocabulary.
 * The tags are the engine's (`view`, `text`, `list`, `scroll-view`,
 * `textarea`), the attributes are spelled the way the engine spells them
 * (`text-maxline`, `scroll-orientation`, `mode`), and the events are Lynx's own
 * (`bindtap`, `catchtap`, `capture-bindtap`). The JSX typings are derived from
 * `@lynx-js/types`, so they are the Lynx team's and they track the engine
 * version an app pins rather than this package's release schedule.
 *
 * That is a deliberate reversal of what this package used to be. It previously
 * owned a five-tag platform-neutral vocabulary and mapped it onto each target,
 * which meant a mapping table somebody had to keep honest, a preview target
 * that could disagree with the device, and a ceiling: everything Lynx could do
 * that the vocabulary had not named was unreachable. Lynx already solves
 * cross-platform — iOS, Android, Harmony and the web are its problem, one layer
 * down — so solving it again here was paying for it twice and getting less.
 *
 * What is left is the part that was always the point: **real nodes, created
 * once, mutated forever by signals.** That is worth more on Lynx than on the
 * web, because the element tree lives on the main thread and every property
 * write is a real mutation with a cost.
 *
 * ## The runtime lives on the main thread
 *
 * Driving the Element PAPI is what puts it there — the PAPI is a main-thread
 * API. A handler is therefore an ordinary closure, and a tap that writes a
 * signal reaches the tree within the frame, with no thread hop. That is what
 * `main-thread:bindtap` buys a React app by hand, one handler at a time, and
 * what this gets by construction. See `docs/mini-lynx-runtime.md` §4
 * for what that costs as well as what it buys.
 *
 * @example
 * ```tsx
 * import { globalEngine, mount, pageElement, setEngine, signal } from '@amritk/mini-lynx'
 *
 * setEngine(globalEngine())
 *
 * const Counter = () => {
 *   const count = signal(0)
 *   return (
 *     <view bindtap={() => count(count() + 1)}>
 *       <text><raw-text text={() => `tapped ${count()} times`} /></text>
 *     </view>
 *   )
 * }
 *
 * mount(pageElement(), Counter)
 * ```
 */

export { addEvent } from './add-event'
export { appendChildren } from './append-children'
export { applyProp } from './apply-prop'
export { bindProp } from './bind/bind-prop'
export { bindShow } from './bind/bind-show'
export { bindText } from './bind/bind-text'
export { bindValue } from './bind/bind-value'
export { clearEngine, globalEngine, requireEngine, setEngine } from './engine/current-engine'
export type { LynxElement, LynxElementApi } from './engine/element-api'
export { type RenderPageOptions, renderPage } from './entry'
export { list } from './list'
export { mount, pageElement } from './mount'
export { onCleanup } from './on-cleanup'
export { type ChildFactory, renderChild } from './render-child'
export {
  batch,
  computed,
  effect,
  effectScope,
  type ReadonlySignal,
  type Signal,
  signal,
} from './signals'
export { applyStyle, applyVisible } from './style/apply-style'
export { toCssName } from './style/to-css-name'
export { toStyleText } from './style/to-style-text'
export {
  clear,
  createElement,
  createRawText,
  createWrapper,
  firstChild,
  insert,
  nextSibling,
  remove,
  setText,
} from './tree'
export type {
  ClassValue,
  Component,
  ContainerChild,
  ContainerChildren,
  Dispose,
  MaybeReactive,
  MiniChild,
  MiniChildren,
  StyleValue,
} from './types'
export { untrack } from './untrack'
export type { IntrinsicElements } from './vocabulary'
export { type WatchOptions, watch } from './watch'
