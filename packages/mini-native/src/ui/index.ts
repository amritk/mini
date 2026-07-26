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
 * ## What is not here yet
 *
 * - **`size` and `tone`.** {@link Heading} takes `level` and nothing else on
 *   purpose, so the outline cannot be chosen by how big the text should look.
 *   The appearance half of that pair arrives with the type scale, resolved
 *   against a theme, and adding the props before there is anything to resolve
 *   them against would ship two names for nothing.
 * - **A theme.** Tokens reach components through context, and context is not
 *   built. One consequence is already settled and worth knowing early: a
 *   component runs exactly once and therefore reads context exactly once, so
 *   the theme will be a SIGNAL rather than a value. That is what makes a live
 *   dark-mode switch work here with no re-render and no invalidation machinery
 *   — the same rule as every other reactive value in the package.
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
export { Text, type TextProps } from './text'
