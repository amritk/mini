/**
 * The narrow slice of `console` this package uses. It is declared rather than
 * imported because the package compiles with no platform library at all, and
 * `console` is a host global rather than part of ECMAScript.
 */
type ConsoleLike = {
  warn: (...data: readonly unknown[]) => void
}

/**
 * Reports a mistake the bridge can recover from but the author almost certainly
 * wants to know about — a reply for a call nobody is waiting on, say, which
 * would otherwise be a message silently dropped on the floor.
 *
 * The logger is reached through `globalThis` and called optionally because a
 * JavaScript engine is not required to provide one, and a missing console
 * should cost a warning rather than crash a screen.
 */
export const warn = (message: string, detail?: unknown): void => {
  const logger = (globalThis as { console?: ConsoleLike }).console
  if (detail === undefined) logger?.warn(`[mini-lynx-native] ${message}`)
  else logger?.warn(`[mini-lynx-native] ${message}`, detail)
}
