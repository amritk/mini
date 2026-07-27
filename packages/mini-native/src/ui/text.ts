import { jsx } from '../jsx-runtime'
import type { HostElement, MiniChildren, StyleValue } from '../types'
import type { Forwarded } from './forwarded'
import { mergeStyle } from './merge-style'
import type { TextSize, Tone, Weight } from './theme'
import { ThemeContext } from './theme-context'

/** Props for {@link Text}. */
export type TextProps = Forwarded<'text'> & {
  /**
   * Which step of the type scale to render at. Appearance only — it says
   * nothing about what this text IS, which is exactly why {@link Heading} keeps
   * `level` separate.
   */
  size?: TextSize
  /**
   * How heavy, as a step of the weight scale. Separate from `size` for the same
   * reason `size` is separate from a heading level: emphasis and scale are two
   * decisions, and a design needs small-and-heavy as often as it needs
   * large-and-light.
   */
  weight?: Weight
  /** What the text is for, resolved to a colour by the theme. */
  tone?: Tone
  /** The text run. A function child is a reactive text binding, as everywhere else. */
  children?: MiniChildren
}

/**
 * A run of text at a step of the type scale.
 *
 * It carries no semantics, deliberately — a run of text means nothing in
 * particular, and saying otherwise would put noise in the accessibility tree.
 * What it does carry is the split that makes a type scale survive contact with
 * a design: `size` is how big, and there is no way to say what this text IS
 * from here at all. A `Text` cannot become a heading by accident, because
 * `role` and `level` are not on its surface.
 *
 * The style is resolved through a getter, so a theme change reaches every piece
 * of text already on screen. The cost is one effect per text element, which is
 * the honest price of a live theme in a runtime with no re-render — and the
 * thing an optional optimising plugin would collapse later, without changing
 * what an app that skips it sees.
 */
export const Text = (props: TextProps): HostElement => {
  const { size, weight, tone, style, ...rest } = props
  const theme = ThemeContext.use()

  // The weight is stated even at the default, for the same reason the scale
  // states a line height at every step: an unstated one is resolved by the
  // target, and the two targets do not have to agree about what it resolves to.
  const base = (): StyleValue => ({
    ...theme().size[size ?? 'md'],
    fontWeight: theme().weight[weight ?? 'regular'],
    color: theme().tone[tone ?? 'default'],
  })

  return jsx('text', { ...rest, style: mergeStyle(base, style) })
}
