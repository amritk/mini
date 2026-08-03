import { appendChildren } from './append-children'
import { applyProp } from './apply-prop'
import { scheduleFlush } from './engine/current-engine'
import type { LynxElement } from './engine/element-api'
import { createElement } from './tree'
import type { Component, MiniChildren } from './types'
import type { IntrinsicElements as LynxIntrinsicElements } from './vocabulary'

/**
 * The JSX runtime — the automatic runtime TypeScript targets when a package
 * sets `"jsx": "react-jsx", "jsxImportSource": "@amritk/mini-lynx"`.
 *
 * JSX here produces REAL LYNX ELEMENTS, immediately, exactly once. There is no
 * virtual tree, no diffing and no re-render: a component function runs a single
 * time and returns the element it built. Everything that changes afterwards
 * changes because a signal wrote to that element directly.
 *
 * That is worth more on Lynx than it is on the web. The engine's element tree
 * lives on the main thread and every property write is a real mutation with a
 * cost, so a runtime that writes only the properties that actually changed is
 * not an optimisation here — it is the difference between one attribute write
 * and a subtree commit.
 *
 * ## The reactivity rule
 *
 * No compiler analyses these expressions, so reactivity is decided by the SHAPE
 * of the value at runtime:
 *
 * - A FUNCTION-valued prop, child or `show` is reactive: it is wrapped in an
 *   effect and re-applied whenever the signals it reads change.
 * - Any other value is static: applied once at creation, never again.
 *
 * Signals are zero-argument functions, so passing one WITHOUT CALLING IT is
 * already a live binding:
 *
 * ```tsx
 * <input disabled={busy} />                  // reactive — tracks forever
 * <input disabled={busy()} />                // STATIC — frozen at creation
 * <text><raw-text text={() => count()} /></text>
 * ```
 *
 * The middle line is the one footgun of a compilerless JSX, and
 * `bun run check:reactivity` exists to catch it.
 *
 * ## Elements and props are Lynx's own
 *
 * `<view>`, `<text>`, `<list>`, `<scroll-view>`, `<textarea>` — the tags are the
 * engine's, the attributes are spelled the way the engine spells them, and the
 * events are `bindtap` / `catchtap` / `capture-bindtap`. The typings are derived
 * from `@lynx-js/types`, so they are the Lynx team's own and they move with the
 * engine version an app pins rather than with this package's release schedule.
 *
 * ## What is deliberately absent
 *
 * - No fragments. Every piece of UI is one root element. Where a real grouping
 *   node is needed, Lynx has one — `<wrapper>` — and the control-flow components
 *   use it.
 * - No raw-markup sink. There is no `innerHTML` equivalent anywhere here, so
 *   bound data cannot inject elements.
 * - No conditional or list rendering inside expressions. A function child is a
 *   reactive TEXT binding only; structural changes go through `Show`, `Dynamic`
 *   and `For`.
 * - `key` on an ELEMENT is accepted (JSX reserves it) and ignored — keying lives
 *   in `list`. On a COMPONENT it is forwarded as an ordinary prop; see below.
 */
export const jsx = (tag: string | Component<never>, props: ElementPropBag, key?: unknown): LynxElement => {
  // A component runs exactly once. There is no instance and no lifecycle;
  // whatever reactivity it sets up internally is all that ever updates after.
  //
  // `key` is handed back to a component rather than dropped. The JSX transform
  // hoists any `key` attribute out of the props object into this third
  // parameter before the component is ever called — a React convention this
  // runtime inherits from the transform whether it wants to or not — so a
  // component with a legitimate prop of that name would silently never receive
  // it. `For` is exactly that component: `<For each={rows} key={byId}>` would
  // quietly fall back to the default key, which shows up as rows mysteriously
  // not updating rather than as an error.
  if (typeof tag === 'function') {
    const withKey = key === undefined ? props : { ...props, key }
    return (tag as (props: ElementPropBag) => LynxElement)(withKey)
  }

  const element = createElement(tag)
  let ref: ((element: LynxElement) => void) | undefined

  // `for…in` rather than `Object.entries`, which allocates an array plus a
  // two-element array per prop — per element, on the main thread, where a
  // thousand-row list turns that into tens of thousands of short-lived arrays
  // for a walk that needs none. The props bag is the object literal the JSX
  // transform emitted, so it has no inherited enumerable keys to skip.
  for (const name in props) {
    const value = props[name]
    if (name === 'children') {
      appendChildren(element, value as MiniChildren)
    } else if (name === 'key') {
      // Reserved by JSX syntax; keying belongs to `list`, so ignore it here.
    } else if (name === 'ref') {
      // Deferred until the element is fully built, so the callback never sees a
      // half-populated node.
      ref = value as (element: LynxElement) => void
    } else {
      applyProp(element, name, value)
    }
  }

  ref?.(element)
  scheduleFlush()
  return element
}

/**
 * The multi-children variant. The automatic runtime calls this when an element
 * has several children, and `jsx` already handles arrays, so it is the same
 * function.
 */
export const jsxs = jsx

/**
 * The development-runtime variant. Its extra debug parameters — source
 * location, `this` — have nothing to attach to in a framework with no component
 * instances, so they are accepted and dropped.
 */
export const jsxDEV = (
  tag: string | Component<never>,
  props: ElementPropBag,
  key?: unknown,
  _isStatic?: boolean,
  _source?: unknown,
  _self?: unknown,
): LynxElement => jsx(tag, props, key)

/**
 * The loose bag the runtime iterates. Call sites are checked richly through
 * `JSX.IntrinsicElements`; by the time props reach `jsx` they are just a
 * string-keyed object, and `unknown` forces the runtime to narrow each value
 * before it uses it.
 */
export type ElementPropBag = { readonly [prop: string]: unknown }

/**
 * The JSX type surface TypeScript resolves from this module.
 *
 * A JSX expression IS the element it creates, which is why one can be passed
 * anywhere the runtime expects an element and why components need no wrapper
 * type.
 */
export namespace JSX {
  export type Element = LynxElement
  export type IntrinsicElements = LynxIntrinsicElements
  export type ElementChildrenAttribute = {
    children: MiniChildren
  }
}
