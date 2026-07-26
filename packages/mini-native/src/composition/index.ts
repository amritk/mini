/**
 * The composition seams a write-once codebase needs.
 *
 * Three things that have nothing obvious in common until you ask what a
 * component is allowed to do beyond returning its own subtree: read something
 * an ancestor provided, put a subtree somewhere else, or survive one that
 * failed to build. Each is a small feature and each is load-bearing for an app
 * that ships to two targets.
 *
 * **{@link createContext}** is the one with a cross-platform argument behind
 * it. `@amritk/mini` refuses context on purpose and is right to — it
 * prop-drills, and its consumer is a byte-budgeted widget. The calculus differs
 * here specifically because the things that vary by platform (theme, insets,
 * navigation, locale, colour scheme) are exactly the things you do not want in
 * a component's signature: prop-drill them and every intermediate component
 * grows a platform-shaped prop it does not use, which is write-once eroding one
 * signature at a time.
 *
 * **{@link Portal}** takes an explicit target rather than asking the host for
 * an overlay root, which keeps the `Host` contract at its size and puts the
 * question — where is the top of the screen — to the app, which wrote its own
 * shell and knows.
 *
 * **{@link ErrorBoundary}** catches a throw during construction. Components run
 * exactly once here, so a throw leaves a half-built tree with no second render
 * to recover on, and what that looks like differs sharply per target: a blank
 * area on the web, a dead app on a device.
 *
 * ## The rule that runs through all three
 *
 * A component runs exactly once, so **a context that changes over time holds a
 * signal, not a value**. It is read once, during the component body, and there
 * is no second read for a later value to arrive on — so the thing that has to
 * stay live is the value itself. That is not a limitation to work around; it is
 * what makes a theme switch reach the whole tree with no re-render, no
 * invalidation pass, and no machinery beyond the signal that was going to exist
 * anyway.
 *
 * @example
 * ```tsx
 * import { createContext } from '@amritk/mini-native/composition'
 *
 * const Theme = createContext(signal(light))
 *
 * mount(root, () => Theme.provide(theme, () => <App />))
 *
 * // any depth below, with nothing threaded in between
 * const Card = () => {
 *   const theme = Theme.use()
 *   return <view style={() => ({ background: theme().surface })} />
 * }
 * ```
 */

export { type Context, createContext } from './create-context'
export { ErrorBoundary, type ErrorBoundaryProps } from './error-boundary'
export { Portal, type PortalProps } from './portal'
