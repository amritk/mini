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

/**
 * The weights of the type scale, separate from {@link TextSize} for the same
 * reason size is separate from heading level: a heading and a body paragraph at
 * the same size need different weights, and a stat that is heavy is not thereby
 * a heading.
 *
 * This exists because without it a heading does not look like one on EITHER
 * target. The reset flattens the user agent's bold `<h1>` along with the rest
 * of its opinions, and a native engine never had one to flatten — so a scale
 * that states size and colour but not weight renders every heading at body
 * weight and does it consistently, which is the worst way to be wrong.
 */
export type Weight = 'regular' | 'medium' | 'semibold' | 'bold'

/** What a piece of text is FOR, as opposed to what colour it happens to be. */
export type Tone = 'default' | 'muted' | 'accent' | 'danger' | 'inverse'

/**
 * What a background is FOR, the same way {@link Tone} says what text is for.
 *
 * `base` is the screen itself; `raised` and `sunken` are the two directions
 * something can sit relative to it — a card and a well — which covers what
 * depth is used for without committing to a shadow. `accent` and `danger` pair
 * with `tone.inverse` for a filled control.
 */
export type Surface = 'base' | 'raised' | 'sunken' | 'accent' | 'danger'

/**
 * Border colours, by how much separation the line is doing.
 *
 * Three neutrals rather than one, because the same divider reads differently
 * against `surface.base` and `surface.raised`, and an app that only has
 * "the border colour" ends up hard-coding the other two.
 */
export type Border = 'subtle' | 'default' | 'strong' | 'accent' | 'danger'

/** Corner radii in density-independent pixels. `full` is the pill, deliberately not a percentage — a percentage radius resolves against different boxes on the two targets. */
export type Radius = 'none' | 'sm' | 'md' | 'lg' | 'full'

/** The spacing steps, so a gap is a decision from a scale rather than a number someone typed. */
export type Space = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/**
 * Everything the component layer needs to resolve a named choice into a real
 * declaration — plus the scales the APP resolves its own taste against.
 *
 * Both halves belong here, and the split is worth being explicit about because
 * it looks like an inconsistency otherwise. `/ui` consumes `size`, `weight`,
 * `tone`, `space`, and `heading`, because typography and spacing are the parts
 * of appearance a component cannot stay correct without. It consumes `surface`,
 * `border`, and `radius` nowhere at all: those are what an app builds its own
 * button and its own card out of, and this package having an opinion about them
 * is exactly the version-coupling `/ui` is kept small to avoid. A theme that
 * carried only what `/ui` reads would leave the app with no scale to be
 * tasteful against, which is the failure this shape is chosen to avoid.
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
  /** The weight scale, in the numeric weights both targets understand. */
  readonly weight: Readonly<Record<Weight, number>>
  /** Text colours by meaning. */
  readonly tone: Readonly<Record<Tone, string>>
  /** Background colours by meaning. Read by the app, not by `/ui`. */
  readonly surface: Readonly<Record<Surface, string>>
  /** Border colours by meaning. Read by the app, not by `/ui`. */
  readonly border: Readonly<Record<Border, string>>
  /** Corner radii in density-independent pixels. Read by the app, not by `/ui`. */
  readonly radius: Readonly<Record<Radius, number>>
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
  /** The weight a {@link Heading} renders at when it does not say. */
  readonly headingWeight: Weight
}

/**
 * The light half of the built-in pair, and the fallback when nothing provides a
 * theme at all.
 *
 * Line heights are stated alongside every size, because an unstated one is the
 * fastest way for two targets to disagree: a browser resolves `normal` from the
 * font's own metrics and a native engine does not.
 *
 * ## Why these are ordinary hex values and not the CSS system colours
 *
 * An earlier version used `CanvasText` and `Canvas` for the two neutrals, so
 * that text followed the platform's light and dark surfaces with no app
 * configuration. That was a good trick on exactly one target. A system colour
 * is a CSS concept: the Lynx host hands the string to an engine that has never
 * heard of it, so the default theme rendered correctly on the web and
 * unpredictably on a device — the precise failure mode this package exists to
 * remove, and one the web target flatters you into not noticing.
 *
 * {@link systemTheme} is what replaces the trick, and it is portable: it
 * follows `colorScheme()`, which every host answers, and switches this theme
 * for {@link darkTheme}. Zero configuration still gets you a working light
 * theme; one call gets you both.
 *
 * The reset keeps its `--mn-color: CanvasText` fallback, which is not the same
 * decision — that is the floor for text nothing has themed at all, on the one
 * target where a system colour means something.
 *
 * The palette itself is an ordinary neutral ramp you are expected to replace. A
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
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  tone: {
    default: '#111827',
    muted: '#6b7280',
    accent: '#4f46e5',
    danger: '#dc2626',
    inverse: '#ffffff',
  },
  surface: {
    base: '#ffffff',
    raised: '#f9fafb',
    sunken: '#f3f4f6',
    accent: '#4f46e5',
    danger: '#dc2626',
  },
  border: {
    subtle: '#f3f4f6',
    default: '#e5e7eb',
    strong: '#d1d5db',
    accent: '#4f46e5',
    danger: '#dc2626',
  },
  radius: { none: 0, sm: 4, md: 8, lg: 16, full: 9999 },
  space: { none: 0, xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  heading: { 1: '3xl', 2: '2xl', 3: 'xl', 4: 'lg', 5: 'md', 6: 'sm' },
  headingWeight: 'bold',
}

/**
 * The dark half of the pair, kept in this file next to the light one on
 * purpose.
 *
 * Two themes that must stay structurally identical are two themes that drift
 * silently when they live apart — a token added to one and forgotten in the
 * other is a screen that is fine until somebody switches. Side by side, the
 * omission is visible while you are editing. `theme.test.ts` pins it anyway,
 * since proximity is a habit and a test is a guarantee.
 *
 * Only the colours differ. The scales — size, weight, radius, spacing — are
 * shared by reference, because a dark theme with a different type scale is not
 * a colour scheme, it is a second design.
 *
 * The accents lighten rather than staying put: a mid-tone indigo that reads as
 * a link on white does not have the contrast to be one on a near-black surface.
 */
export const darkTheme: Theme = {
  ...defaultTheme,
  tone: {
    default: '#f9fafb',
    muted: '#9ca3af',
    accent: '#a5b4fc',
    danger: '#f87171',
    inverse: '#111827',
  },
  surface: {
    base: '#111827',
    raised: '#1f2937',
    sunken: '#030712',
    accent: '#6366f1',
    danger: '#ef4444',
  },
  border: {
    subtle: '#1f2937',
    default: '#374151',
    strong: '#4b5563',
    accent: '#6366f1',
    danger: '#ef4444',
  },
}
