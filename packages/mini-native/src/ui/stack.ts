import { jsx } from '../jsx-runtime'
import type { ContainerChildren, HostElement, StyleValue } from '../types'
import type { Forwarded } from './forwarded'
import { mergeStyle } from './merge-style'
import type { Space } from './theme'
import { ThemeContext } from './theme-context'

/**
 * The one thing a `Stack` asserts.
 *
 * `flexDirection` alone would not do it. A native target lays every view out
 * with flexbox already, and a browser does not — an unstyled `<div>` is
 * `display: block`, where `flexDirection` is simply ignored — so stating both
 * is what makes the two agree about alignment, sizing, and gaps rather than
 * only about the direction children happen to fall in.
 *
 * That this has to be said per component is a symptom, not a design. The full
 * answer is the layout reset the DOM host owes, which makes a browser behave
 * like Yoga once for every element; until that lands, the components carrying
 * layout carry it themselves.
 */
const COLUMN: StyleValue = { display: 'flex', flexDirection: 'column' }

/** Props for {@link Stack}. */
export type StackProps = Forwarded<'view'> & {
  /**
   * Space between children, as a step of the theme's spacing scale.
   *
   * A named step rather than a number, so spacing across an app is a set of
   * decisions rather than a set of numbers people typed. Reach for `style` when
   * a layout genuinely needs a value that is not on the scale — that it looks
   * out of place is the point.
   */
  gap?: Space
  /** Nested elements. Like any container, it cannot hold a bare text run. */
  children?: ContainerChildren
}

/**
 * Children in a column.
 *
 * Layout only — no role, no accessible name, nothing announced. It is the
 * component you reach for when a `view` needed no meaning, which keeps a screen
 * file free of vocabulary tags without pretending the grouping means something
 * to a screen reader.
 *
 * `gap` takes a step of the theme's spacing scale rather than a number, which
 * is the line this whole layer draws applied to spacing: the package knows that
 * a scale should exist and that a gap should come from it, and the app decides
 * what the steps actually are.
 */
export const Stack = (props: StackProps): HostElement => {
  const { gap, style, ...rest } = props
  const theme = ThemeContext.use()

  // Only reactive when there is something to resolve: a stack with no gap gets
  // a constant style bag and no effect at all, which matters on a device where
  // a container view is the most common element in the tree.
  const base = gap === undefined ? COLUMN : (): StyleValue => ({ ...COLUMN, gap: theme().space[gap] })

  return jsx('view', { ...rest, style: mergeStyle(base, style) })
}
