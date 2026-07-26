import type { StyleValue } from '../types'

/**
 * The steps of the type scale.
 *
 * Named rather than numbered, and independent of heading level, which is the
 * point of the whole scale existing. A sidebar section header is an `h2` that
 * renders small; a hero stat is large text that is not a heading at all. Couple
 * the two and authors start choosing heading levels by how big they want the
 * text, and the document outline stops meaning anything to a screen reader or a
 * crawler.
 */
export type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'

/** What a piece of text is FOR, as opposed to what colour it happens to be. */
export type Tone = 'default' | 'muted' | 'accent' | 'danger' | 'inverse'

/** The spacing steps, so a gap is a decision from a scale rather than a number someone typed. */
export type Space = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/**
 * Everything the component layer needs to resolve a named choice into a real
 * declaration.
 *
 * Tokens resolve to STYLE OBJECTS rather than to classes, and that is the one
 * genuinely cross-platform decision in this file. Classes are cheaper on the
 * web — an atomic class per declaration, deduplicated across the app — and they
 * are meaningless on a headless host and a different mechanism again on a
 * native engine. A style object is the only shape every target consumes, so it
 * is the portable default; class extraction stays available later as a web-only
 * optimisation behind the optional plugin, where skipping it costs bytes rather
 * than correctness.
 */
export type Theme = {
  /** The type scale. One entry per {@link TextSize}, resolved into a style bag. */
  readonly size: Readonly<Record<TextSize, StyleValue>>
  /** Text colours by meaning. */
  readonly tone: Readonly<Record<Tone, string>>
  /** Spacing steps in density-independent pixels. */
  readonly space: Readonly<Record<Space, number>>
  /**
   * Which scale step a heading of each depth uses when it does not say.
   *
   * This is what keeps the common path short without coupling the two: writing
   * `<Heading level={2}>` picks the step that usually matches, and `size` is
   * there for when a design genuinely disagrees with the outline.
   */
  readonly heading: Readonly<Record<1 | 2 | 3 | 4 | 5 | 6, TextSize>>
}

/**
 * A theme that is a real starting point rather than a placeholder.
 *
 * Line heights are stated alongside every size, because an unstated one is the
 * fastest way for two targets to disagree: a browser resolves `normal` from the
 * font's own metrics and a native engine does not.
 *
 * The two neutral colours are the CSS system colours, so text follows the
 * platform's light and dark surfaces without an app having to define a theme at
 * all. The other three are ordinary values you are expected to replace — a
 * default theme has to pick something, and picking nothing would mean shipping
 * a `tone` prop that does nothing until configured.
 */
export const defaultTheme: Theme = {
  size: {
    xs: { fontSize: 12, lineHeight: 16 },
    sm: { fontSize: 14, lineHeight: 20 },
    md: { fontSize: 16, lineHeight: 24 },
    lg: { fontSize: 18, lineHeight: 28 },
    xl: { fontSize: 24, lineHeight: 32 },
    '2xl': { fontSize: 30, lineHeight: 38 },
    '3xl': { fontSize: 36, lineHeight: 44 },
  },
  tone: {
    default: 'CanvasText',
    muted: '#6b7280',
    accent: '#4f46e5',
    danger: '#dc2626',
    inverse: 'Canvas',
  },
  space: { none: 0, xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  heading: { 1: '3xl', 2: '2xl', 3: 'xl', 4: 'lg', 5: 'md', 6: 'sm' },
}
