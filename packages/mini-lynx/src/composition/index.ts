/**
 * The composition seams a write-once codebase needs.
 *
 * Three things that have nothing obvious in common until you ask what a
 * component is allowed to do beyond returning its own subtree: read something
 * an ancestor provided, put a subtree somewhere else, or survive one that
 * failed to build. Each is a small feature and each is load-bearing for an app
 * of any size.
 *
 * **{@link createContext}** is the one that needs an argument, because
 * `@amritk/mini` refuses context on purpose and is right to — it prop-drills,
 * and its consumer is a byte-budgeted widget. The calculus differs here because
 * the things an app-shaped runtime has to carry ambiently (theme, safe-area
 * insets, navigation, locale, colour scheme) are exactly the things you do not
 * want in a component's signature: prop-drill them and every intermediate
 * component grows a prop it does not use, which is write-once eroding one
 * signature at a time.
 *
 * **{@link Portal}** takes an explicit target rather than nominating an overlay
 * root of its own, which puts the question — where is the top of the screen —
 * to the app, which wrote its own shell and knows whether it has an
 * `<overlay>`.
 *
 * **{@link ErrorBoundary}** catches a throw during construction. Components run
 * exactly once here, so a throw leaves a half-built tree with no second render
 * to recover on — on a device that is a dead app and a crash report, with no
 * reload to fall back on.
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
 * import { createContext } from '@amritk/mini-lynx/composition'
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
