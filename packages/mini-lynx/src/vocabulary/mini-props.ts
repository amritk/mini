import type { ClassValue, LynxElement, MaybeReactive, StyleValue } from '../types'

/**
 * The props this runtime adds on top of Lynx's own, on every tag.
 *
 * Everything else in `IntrinsicElements` is derived from `@lynx-js/types`, so
 * it belongs to the engine and moves with the engine version an app pins. This
 * is the short list that does not: three props the runtime implements itself,
 * plus two OVERRIDES where the value shapes we accept are genuinely wider than
 * the ones the package declares.
 *
 * It lives in its own file so that boundary stays visible. If this type grows,
 * the runtime has started inventing vocabulary again — which is exactly the
 * thing driving the engine's own element surface was meant to stop.
 */
export type MiniProps = {
  /**
   * Called with the element once it is fully built — children appended, every
   * prop applied.
   *
   * The escape hatch for anything with no prop form: a `SelectorQuery` against
   * the node, one of the engine's imperative UI methods, an event the
   * vocabulary does not name. It deliberately runs last, so a callback never
   * sees a half-populated element.
   */
  ref?: (element: LynxElement) => void

  /**
   * Reactive visibility. A boolean applies once; a getter tracks forever.
   *
   * This is deliberately not spelled `style={{ visibility: … }}`. The runtime
   * remembers visibility separately from the inline style and re-asserts it
   * after a wholesale style write, because sharing one channel between the two
   * means a later `style` update quietly un-hides a hidden element. That
   * failure depends on the order the props happened to be written in, so it
   * shows up intermittently — the worst shape a bug can have.
   */
  show?: MaybeReactive<boolean>

  /**
   * Accepted because JSX reserves the name, and ignored at runtime.
   *
   * There is no keying at the JSX level here at all: reconciliation lives in
   * `list`, and the engine's own recycling identity is `list-item`'s
   * `item-key`. Accepting the prop rather than rejecting it means a tree pasted
   * out of a React-shaped codebase still compiles, instead of failing on a
   * concept this runtime does not have.
   */
  key?: string | number

  /**
   * Inline style, as a bag of declarations or as a whole CSS string.
   *
   * This REPLACES `StandardProps['style']` (`string | CSSProperties`) rather
   * than intersecting with it, and the replacement is load-bearing. Ours is
   * wider in the direction that matters on a native target: a bare number means
   * density-independent pixels and the runtime appends the unit, so
   * `{ width: 100 }` is a hundred pixels instead of a declaration the engine
   * silently discards. An intersection could not express that, since a value
   * has to satisfy BOTH sides of an `&` — the extra shapes would be
   * unreachable, which is the same as not offering them.
   */
  style?: MaybeReactive<StyleValue | string | null>

  /**
   * One or more class names, as a string, a nested array, or a toggle map.
   *
   * Replaces `StandardProps['class']` (a plain `string`) for the same reason
   * `style` does: `resolveClass` collapses every form into the single
   * space-joined string the engine wants, and intersecting with `string` would
   * reject exactly the two forms worth having.
   *
   * Classes are worth caring about here in a way they never were on a target
   * with no stylesheet — Lynx has real CSS, so a class is the cheap channel and
   * an inline style is the dynamic one.
   */
  class?: MaybeReactive<ClassValue>
}
