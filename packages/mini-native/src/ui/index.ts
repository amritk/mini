/**
 * The component layer — the named things a screen is actually written in.
 *
 * ## The line this layer draws
 *
 * **The package ships the semantics; the app ships the taste.** `<Button>` knows
 * that a button is a button on both targets, is reachable by keyboard on both,
 * and is *unavailable* rather than merely greyed. It does not know that your
 * buttons are 44px tall with a 6px radius. The first is portable knowledge that
 * is easy to get wrong, invisible when you get it wrong, and worth centralising
 * exactly once; the second is your product's and changes with it.
 *
 * Drawing the line there has two consequences worth stating. This layer needs
 * no host machinery at all — it is pure composition over the `role` prop the
 * vocabulary already carries, so it grows the `Host` contract by nothing. And
 * because none of it has an appearance, every component has an assertable
 * semantic outcome on all three hosts, which is why they sit in the parity
 * suite alongside the vocabulary itself.
 *
 * ## Why to write screens in these rather than in tags
 *
 * This is the highest-leverage habit available in a cross-platform codebase,
 * and it is the thing that keeps every decision underneath it reversible.
 *
 * Write `<view role="button" focusable label={…}>` across two hundred screens
 * and the vocabulary is load-bearing everywhere, so every choice in it is
 * permanent. Write `<Button>` and the vocabulary appears in about a dozen
 * components — at which point the role layer can change, the event payloads can
 * change, and even the question of whether the source vocabulary should have
 * been HTML all along becomes a rewrite of this directory rather than a rewrite
 * of the app.
 *
 * The rule, then: **a screen file should contain almost no vocabulary tags.**
 *
 * ## The theme is a signal
 *
 * {@link ThemeContext} carries a signal rather than a `Theme`, and that is
 * load-bearing rather than stylistic. A component runs exactly once and
 * therefore reads context exactly once — a plain theme would be whatever it was
 * at boot, forever. Holding the signal means every component reads it once and
 * goes on tracking it, so a dark-mode switch reaches the whole tree with no
 * re-render, no invalidation pass, and no machinery beyond the signal that was
 * going to exist anyway.
 *
 * Not providing one is a supported state. The fallback is a real theme, so a
 * component renders correctly on its own, in a test, with no app around it.
 *
 * ## What is not here yet
 *
 * - **Icons, fields, and the rest of a real design system.** What is here is
 *   the set whose correctness is portable and easy to get wrong. Everything
 *   past that is taste, and taste belongs to the app — the smaller this layer
 *   stays, the less a design system built on it is version-coupled to this
 *   package.
 *
 * @example
 * ```tsx
 * import { Button, Heading, List, ListItem, Row, Screen, Text } from '@amritk/mini-native/ui'
 *
 * const Cart = (props: { items: () => Item[]; checkout: () => void }) => (
 *   <Screen>
 *     <Heading level={2}>Your cart</Heading>
 *     <List label="Cart items">
 *       <For each={props.items}>
 *         {(item) => (
 *           <ListItem>
 *             <Row>
 *               <Text>{item.name}</Text>
 *               <Text>{item.price}</Text>
 *             </Row>
 *           </ListItem>
 *         )}
 *       </For>
 *     </List>
 *     <Button onTap={props.checkout}>Check out</Button>
 *   </Screen>
 * )
 * ```
 */

export { Button, type ButtonProps } from './button'
export { Heading, type HeadingProps } from './heading'
export { Link, type LinkProps } from './link'
export { List, type ListProps } from './list'
export { ListItem, type ListItemProps } from './list-item'
export { Row, type RowProps } from './row'
export { Screen, type ScreenProps } from './screen'
export { Stack, type StackProps } from './stack'
export { systemTheme } from './system-theme'
export { Text, type TextProps } from './text'
export {
  type Border,
  darkTheme,
  defaultTheme,
  type Radius,
  type Space,
  type Surface,
  type TextSize,
  type Theme,
  type Tone,
  type Weight,
} from './theme'
export { ThemeContext } from './theme-context'
