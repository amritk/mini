import { jsx } from '../jsx-runtime'
import type { HostElement, MiniChildren, StyleValue } from '../types'
import type { Forwarded } from './forwarded'
import { mergeStyle } from './merge-style'
import type { TextSize, Tone, Weight } from './theme'
import { ThemeContext } from './theme-context'

/** Props for {@link Heading}. */
export type HeadingProps = Forwarded<'text'> & {
  /**
   * Depth in the document outline, 1–6, defaulting to 2 so a screen's single
   * top-level heading stays a deliberate act.
   *
   * The SEMANTIC prop: it says where this sits in the outline, never how big it
   * renders. See {@link size} for the other half.
   */
  level?: 1 | 2 | 3 | 4 | 5 | 6
  /**
   * Which step of the type scale to render at, overriding the one the theme
   * pairs with this `level`.
   *
   * The two being separate is the thing most typography systems get wrong, and
   * it is unrecoverable later. A real page needs an `h2` that renders small — a
   * sidebar section header — and needs large text that is not a heading at all,
   * which is what {@link Text} is for. Couple size to level and authors start
   * picking heading levels by how big they want the text, which is precisely
   * how a document outline stops being navigable to a screen reader and, on the
   * web, to a crawler.
   *
   * ```tsx
   * <Heading level={2} size="sm">Related</Heading>  // an h2 that renders small
   * <Text size="xl">$4,200</Text>                   // large, and not a heading
   * ```
   */
  size?: TextSize
  /**
   * How heavy, overriding the theme's `headingWeight`.
   *
   * A heading needs a default here in a way body text does not: the reset
   * flattens the user agent's bold `<h1>` along with everything else it
   * normalises away, and a native engine never had one — so without a weight in
   * the scale a heading renders at body weight on both targets.
   */
  weight?: Weight
  /** What the heading is for, resolved to a colour by the theme. */
  tone?: Tone
  children?: MiniChildren
}

/**
 * A heading, at a stated depth in the outline.
 *
 * The DOM host builds a real `<h1>`…`<h6>` from `level`, so find-in-page, the
 * browser's own outline, and a crawler all see it; a native host reports a
 * heading of that depth to the platform's accessibility layer. Neither is
 * something a component author should have to remember, which is the argument
 * for this layer existing at all.
 *
 * Omitting `size` picks the scale step the theme pairs with this level, so the
 * common path stays short and you reach for `size` only when a design genuinely
 * disagrees with the outline.
 */
export const Heading = (props: HeadingProps): HostElement => {
  const { level, size, weight, tone, style, ...rest } = props
  const theme = ThemeContext.use()

  const base = (): StyleValue => ({
    ...theme().size[size ?? theme().heading[level ?? 2]],
    fontWeight: theme().weight[weight ?? theme().headingWeight],
    color: theme().tone[tone ?? 'default'],
  })

  return jsx('text', {
    ...rest,
    role: 'heading',
    ...(level === undefined ? {} : { level }),
    style: mergeStyle(base, style),
  })
}
