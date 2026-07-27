/**
 * Spells one style-bag entry the way the engine wants to read it.
 *
 * A bare number in a style bag means density-independent pixels — the
 * convention every native toolkit and React Native itself uses — and this is
 * the one place that gets applied.
 *
 * ## This convention is ours, not Lynx's, and that is worth being clear about
 *
 * Lynx has **no implicit unit**. In its CSS a bare number is not a length at
 * all: `width: 100` is invalid and silently does nothing, and `0` is the only
 * number a length accepts without a unit. `@lynx-js/react` appends nothing and
 * leaves the question to the author, so `width: 100` in a ReactLynx codebase is
 * a bug that typechecks.
 *
 * Adding the unit here is therefore a deliberate ergonomic rather than a
 * translation of something the engine does. It is worth the small divergence:
 * the failure it removes is invisible — a declaration the engine drops without
 * complaint — and the escape hatch is complete, because any other unit is
 * expressible as a string (`'50%'`, `'2rem'`, `'calc(100% - 8px)'`).
 *
 * The properties CSS treats as ratios, counts or multipliers stay unitless; see
 * {@link UNITLESS}.
 *
 * @param key The style key, camelCase or kebab-case, as the caller wrote it.
 * @param value The entry's value. Callers drop the `null | undefined | false`
 *   arms of `StyleValue` first, since those mean "unset" rather than a value.
 *
 * @example
 * ```ts
 * toStyleText('width', 100) // '100px'
 * toStyleText('opacity', 0.5) // '0.5'
 * toStyleText('width', '50%') // '50%'
 * ```
 */
export const toStyleText = (key: string, value: string | number): string => {
  if (typeof value !== 'number') return String(value)
  // A custom property is whatever its author says it is, so guessing a unit for
  // one would be presumptuous — pass the number through and let the declaration
  // that consumes it decide.
  if (key.startsWith('--')) return String(value)
  return UNITLESS.has(normalise(key)) ? String(value) : `${value}px`
}

/**
 * The properties whose numbers are ratios, counts, or multipliers rather than
 * lengths, so a unit would break them.
 *
 * Kept short on purpose: this covers what a layout actually reaches for, and an
 * unlisted property that turns out to need it is a one-line addition. The names
 * are stored normalised so both spellings of a key match.
 *
 * `line-height` is deliberately ABSENT even though CSS treats a bare number
 * there as a multiplier, and that is the dp rule winning over the web's local
 * convention rather than an oversight. A style bag is read the same way on
 * every target, and every native toolkit — React Native included — measures
 * line height in dp, and Lynx accepts a length there. Keeping one rule — a bare
 * number is dp — is worth more than matching CSS's local convention for one
 * property, because a bag that reads the same way throughout is a bag nobody has
 * to remember exceptions for. An app that genuinely wants the ratio says so with
 * a string (`lineHeight: '1.5'`), which is the same escape hatch every other
 * length has.
 */
const UNITLESS = new Set([
  // Web-standard ratios, counts and multipliers.
  'opacity',
  'zindex',
  'flex',
  'flexgrow',
  'flexshrink',
  'order',
  'fontweight',
  'zoom',
  'aspectratio',
  'scale',
  'gridcolumnspan',
  'gridrowspan',
  // Lynx's own, from its two non-flex layout systems. Missing them is not a
  // cosmetic omission: `linear-weight: 1px` is not a valid declaration, so the
  // engine drops it and the element falls back to its unweighted size — a
  // layout that is wrong in a way no error reports. They are easy to overlook
  // precisely because nothing on the web has them.
  'linearweight',
  'linearweightsum',
  'relativeid',
  'relativealigntop',
  'relativealignright',
  'relativealignbottom',
  'relativealignleft',
  'relativetopof',
  'relativerightof',
  'relativebottomof',
  'relativeleftof',
  'relativelayoutonce',
])

/** Folds `zIndex` and `z-index` onto the same lookup key, since style bags accept both. */
const normalise = (key: string): string => key.replace(/-/g, '').toLowerCase()
