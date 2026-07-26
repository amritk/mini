import type { MaybeReactive, StyleValue } from '../types'

/**
 * Lays a caller's `style` over a component's own base declarations.
 *
 * A few components here carry layout of their own — `Stack` is a column, `Row`
 * is a row — and that has to survive someone passing `style`. Merging keeps
 * both: the base decides the direction, the caller decides everything else, and
 * a caller who really wants the other direction can still say so.
 *
 * The reactive form is preserved rather than flattened. A getter comes back as
 * a getter, so a style that tracks a signal goes on tracking it — collapsing it
 * to a value here would turn a live binding into a one-time write, which is the
 * package's single most expensive mistake to debug.
 */
export const mergeStyle = (
  base: StyleValue,
  style: MaybeReactive<StyleValue | null> | undefined,
): MaybeReactive<StyleValue> => {
  if (style === undefined) return base
  if (typeof style === 'function') return () => ({ ...base, ...style() })
  return { ...base, ...style }
}
