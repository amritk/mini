import { currentFrame, withFrame } from '../context-frame'

/**
 * A value some part of the tree provides and anything built inside it can read.
 *
 * Created once, at module scope, and then used from both ends — the provider
 * calls {@link Context.provide} and the consumer calls {@link Context.use}. The
 * two never have to know about each other, which is the whole point: a
 * component that reads the theme does not take a theme prop, and neither does
 * anything between it and the provider.
 */
export type Context<T> = {
  /**
   * Provides `value` to everything `build` constructs, and returns whatever
   * `build` returned.
   *
   * `build` is a FUNCTION rather than an already-built element, and that is not
   * a stylistic choice — it is forced by the runtime and it is the one thing to
   * get right when using this. JSX here builds nodes immediately, so in
   * `<Provider>{<Child/>}</Provider>` the child is constructed as an ARGUMENT,
   * before the provider has run at all. Passing a function is what puts the
   * child's construction inside the provider instead of before it. `Show` and
   * `For` already take their children the same way, for a related reason.
   */
  provide: <R>(value: T, build: () => R) => R

  /**
   * Reads the nearest provided value, or the fallback if nothing provided one.
   *
   * Read once, during the component body, because a component runs exactly
   * once — there is no second read for a later value to arrive on. That is the
   * reason a context whose value changes over time should hold a SIGNAL rather
   * than a value: the signal is read once and stays live forever, which is how
   * a theme switch reaches the whole tree with no re-render and no invalidation
   * machinery at all.
   */
  use: () => T
}

/**
 * Creates a context with a fallback for when nothing has provided one.
 *
 * ```ts
 * const Theme = createContext(signal(lightTokens))
 *
 * // at the app root
 * mount(root, () => Theme.provide(theme, () => <App />))
 *
 * // anywhere below, at any depth, with nothing threaded in between
 * const theme = Theme.use()
 * <view style={() => ({ background: theme().surface })} />
 * ```
 *
 * ## Why this package has context when `@amritk/mini` refuses it
 *
 * `mini` prop-drills on purpose, and it is right to: its consumer is a
 * byte-budgeted widget dropped into somebody else's page, where an ambient
 * registry is surface nobody asked for.
 *
 * The calculus here is different, and specifically because of cross-platform.
 * The things that vary by platform — theme, insets, navigation, locale, colour
 * scheme — are exactly the things you do not want in a component's signature.
 * Prop-drill them and every intermediate component grows a platform-shaped prop
 * it does not use, which is write-once eroding one signature at a time. A
 * component that takes `insets` as a prop is already a component that knows it
 * might be on a phone.
 *
 * ## The fallback is a real value, not a "not provided" sentinel
 *
 * There is no throw-if-missing mode. A context that can be absent is one every
 * caller has to narrow, and the cases this exists for — a theme, a locale — all
 * have a sensible default that a component can be developed against on its own.
 * If a context genuinely has no meaningful default, make the fallback a value
 * that fails loudly when used rather than making every read return `undefined`.
 */
export const createContext = <T>(fallback: T): Context<T> => {
  // A fresh key per context, so two contexts can never collide and a frame can
  // hold as many as the tree provides.
  const key = Symbol('context')

  return {
    provide: (value, build) => withFrame(new Map(framesOf(currentFrame())).set(key, value), build),

    use: () => {
      const frame = framesOf(currentFrame())
      return frame.has(key) ? (frame.get(key) as T) : fallback
    },
  }
}

/** An empty frame, shared, since nothing ever mutates one in place. */
const EMPTY: ReadonlyMap<symbol, unknown> = new Map()

/**
 * Reads core's opaque frame as the map this module stores in it.
 *
 * Core carries the frame around without knowing its shape — it only has to put
 * back whatever was ambient when a lazily-built subtree was written — so the
 * cast is confined here, where the shape is decided.
 */
const framesOf = (frame: unknown): ReadonlyMap<symbol, unknown> =>
  frame instanceof Map ? (frame as ReadonlyMap<symbol, unknown>) : EMPTY
