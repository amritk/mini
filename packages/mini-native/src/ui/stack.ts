import { jsx } from '../jsx-runtime'
import type { ContainerChildren, HostElement, StyleValue } from '../types'
import type { Forwarded } from './forwarded'
import { mergeStyle } from './merge-style'

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
 * Spacing is deliberately absent. Where children stack is a portability
 * question and the package answers it; how far apart they sit is taste, and
 * taste belongs to the app until there are tokens to resolve a named step
 * against. Pass `style` in the meantime — it merges over the direction rather
 * than replacing it.
 */
export const Stack = (props: StackProps): HostElement => {
  const { style, ...rest } = props
  return jsx('view', { ...rest, style: mergeStyle(COLUMN, style) })
}
