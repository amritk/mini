/**
 * Converts a camelCase style key to its CSS spelling, leaving custom properties
 * alone.
 *
 * A style bag accepts both spellings — `fontSize` and `font-size` are the same
 * property everywhere in this package, and most examples are written in the
 * camelCase one. The engine is handed DECLARATIONS, though — `__SetInlineStyles`
 * takes a map it parses as CSS — and CSS has never had a `fontSize` property.
 * An unrecognised declaration is dropped in silence rather than reported, which
 * is why this conversion is not optional and why it lives in one place.
 *
 * This is the direction that is easy to get backwards. A KEYFRAME, were one
 * ever handed over, would want the IDL spelling instead, because a keyframe is
 * a plain object read by property name rather than a declaration parsed as
 * CSS. The rule is about how the value is CONSUMED, not about which package it
 * came from.
 *
 * @example
 * ```ts
 * toCssName('backgroundColor')  // 'background-color'
 * toCssName('font-size')        // 'font-size'
 * toCssName('--brand')          // '--brand'
 * ```
 */
export const toCssName = (key: string): string =>
  key.startsWith('--') ? key : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
