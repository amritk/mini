import { jsx } from '../jsx-runtime'
import type { ContainerChildren, HostElement, StyleValue } from '../types'
import type { Forwarded } from './forwarded'
import { mergeStyle } from './merge-style'

/** A list stacks, for the same reason {@link Stack} does — see the note there. */
const COLUMN: StyleValue = { display: 'flex', flexDirection: 'column' }

/** Props for {@link List}. */
export type ListProps = Forwarded<'view'> & {
  /**
   * The items. Element children only, as with any container — and note that a
   * control-flow component between this and its items is fine, which is the
   * whole reason a `list` role does not build a `<ul>`.
   */
  children?: ContainerChildren
}

/**
 * A list of items, announced as one.
 *
 * Worth knowing what it does NOT build: `<ul>`. A `<ul>` may contain only
 * `<li>`, which is a parse-level content model no attribute can rescue, and
 * every control-flow component puts a wrapper between a container and its
 * children — so `<List><For …/></List>`, the obvious way to write a list of
 * anything, would have the browser reshape the tree. An ARIA role carries no
 * content model, so the generic element survives the wrapper and the
 * list-owns-listitem relationship holds. The wrapper itself is presentational
 * on every host, which is what keeps it out of the way.
 *
 * That means the ordinary thing works, and it is worth writing out because it
 * is the case the design had to be bent around:
 *
 * ```tsx
 * <List label="Cart">
 *   <For each={items}>{(item) => <ListItem>{item.name}</ListItem>}</For>
 * </List>
 * ```
 */
export const List = (props: ListProps): HostElement => {
  const { style, ...rest } = props
  return jsx('view', { ...rest, role: 'list', style: mergeStyle(COLUMN, style) })
}
