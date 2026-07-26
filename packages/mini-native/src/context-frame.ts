/**
 * The ambient value a lazily-built subtree should see — captured where the
 * subtree was WRITTEN and restored when it is actually built.
 *
 * This exists for one problem, and it is the problem that makes context hard in
 * a runtime with no virtual tree. Components run exactly once, top to bottom,
 * so anything ambient can be a plain variable that a provider sets around the
 * work it wraps. Except that `Show`, `Switch`, `Dynamic`, `For`, and `Index` do
 * not build their children then: they build them later, inside an effect, long
 * after the provider returned and put the variable back. A theme provided at
 * the app root would reach every component except the ones inside a
 * conditional or a list — which is to say, almost none of the interesting ones,
 * and it would fail silently by falling back to a default that looks plausible.
 *
 * So the two places that build subtrees lazily — `renderChild` and `list` —
 * capture this when they are CALLED, which is during the component body and
 * therefore inside whatever provider wraps it, and restore it around every
 * build afterwards. That is the whole mechanism.
 *
 * Core deliberately does not know what a frame IS. It is `unknown` here and the
 * `/context` subpath decides its shape, which keeps the composition feature out
 * of the entry every app pays for while still letting the two core functions
 * that must cooperate do so. Core's only claim is "whatever was ambient when
 * this subtree was written is ambient again while it is built".
 */
let current: unknown = null

/** The frame in force right now, to be handed back to {@link withFrame} later. */
export const currentFrame = (): unknown => current

/** Runs `run` with `frame` in force, restoring whatever was there before. */
export const withFrame = <T>(frame: unknown, run: () => T): T => {
  const previous = current
  current = frame
  try {
    return run()
  } finally {
    current = previous
  }
}
