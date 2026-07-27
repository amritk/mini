import { jsx } from '../jsx-runtime'
import type { HostElement, MiniChildren } from '../types'
import type { Forwarded } from './forwarded'
import { wrapTextRuns } from './wrap-text-runs'

/** Props for {@link ListItem}. */
export type ListItemProps = Forwarded<'view'> & {
  /** The item. A bare text run is fine — see {@link wrapTextRuns}. */
  children?: MiniChildren
}

/**
 * One item in a {@link List}.
 *
 * It carries no layout of its own, because an item is whatever the list is made
 * of — a row, a card, a single line — and guessing would only be something to
 * undo. The role is the entire contribution, and it is the half that is easy to
 * forget and impossible to notice: a list whose items lost their role still
 * looks exactly right and is announced as a shapeless group.
 */
export const ListItem = (props: ListItemProps): HostElement => {
  const { children, ...rest } = props
  return jsx('view', { ...rest, role: 'listitem', children: wrapTextRuns(children) })
}
