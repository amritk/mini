import { jsx } from '../jsx-runtime'
import type { ContainerChildren, HostElement, StyleValue } from '../types'
import type { Forwarded } from './forwarded'
import { mergeStyle } from './merge-style'
import type { Space } from './theme'
import { ThemeContext } from './theme-context'

/**
 * The one thing a `Row` asserts — and the direction that actually diverges.
 *
 * A column is what both targets do anyway, roughly: block children stack down a
 * page and a native view tree is flex-column by default. A row is not. It has
 * to be stated on both, and on the web it needs `display: flex` alongside, or
 * the direction is read against a `display: block` element and ignored.
 */
const ROW: StyleValue = { display: 'flex', flexDirection: 'row' }

/** Props for {@link Row}. */
export type RowProps = Forwarded<'view'> & {
  /** Space between children, as a step of the theme's spacing scale. */
  gap?: Space
  /** Nested elements. Like any container, it cannot hold a bare text run. */
  children?: ContainerChildren
}

/**
 * Children in a row.
 *
 * {@link Stack} turned sideways, with the same reasoning about spacing: the
 * direction is portability and belongs here, the size of the gap is taste and
 * comes from the theme.
 */
export const Row = (props: RowProps): HostElement => {
  const { gap, style, ...rest } = props
  const theme = ThemeContext.use()

  const base = gap === undefined ? ROW : (): StyleValue => ({ ...ROW, gap: theme().space[gap] })

  return jsx('view', { ...rest, style: mergeStyle(base, style) })
}
