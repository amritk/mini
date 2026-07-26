import type { MaybeReactive, StyleValue } from '../types'

/**
 * Lays a caller's `style` over a component's own base declarations.
 *
 * A few components here carry layout of their own — `Stack` is a column, `Row`
 * is a row — and that has to survive someone passing `style`. Merging keeps
 * both: the base decides the direction, the caller decides everything else, and
 * a caller who really wants the other direction can still say so.
 *
 * The reactive form is preserved rather than flattened, on EITHER side. A
 * getter comes back as a getter, so a style that tracks a signal goes on
 * tracking it — collapsing it to a value here would turn a live binding into a
 * one-time write, which is the package's single most expensive mistake to
 * debug. The base is reactive too because `Screen` needs it: its padding comes
 * from the safe-area signal, which changes on rotation.
 */
export const mergeStyle = (
  base: MaybeReactive<StyleValue>,
  style: MaybeReactive<StyleValue | null> | undefined,
): MaybeReactive<StyleValue> => {
  if (style === undefined) return base
  if (typeof base === 'function' || typeof style === 'function') {
    return () => ({ ...read(base), ...read(style) })
  }
  return { ...base, ...style }
}

/** Resolves either form to a bag, so the merge above does not care which it got. */
const read = (value: MaybeReactive<StyleValue | null>): StyleValue | null =>
  typeof value === 'function' ? value() : value
