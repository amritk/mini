import type { ContextMessage } from './context-proxy'

/**
 * The wire between the two halves of this package, in one file so neither half
 * can drift from the other.
 *
 * Both sides import these constants and types; nothing else in the package
 * spells a channel name or a payload shape. The channels are prefixed so a page
 * running another framework on the same contexts — the situation a migration
 * lives in for as long as it takes — cannot collide with them.
 */
const PREFIX = 'mini-lynx-native:'

/** Main thread → background: invoke a method on a native module. */
export const CALL = `${PREFIX}call`

/** Background → main thread: the outcome of one {@link CALL}. */
export const REPLY = `${PREFIX}reply`

/** Main thread → background: start forwarding a `GlobalEventEmitter` event. */
export const LISTEN = `${PREFIX}listen`

/** Main thread → background: stop forwarding one. */
export const UNLISTEN = `${PREFIX}unlisten`

/** Background → main thread: an event the emitter published. */
export const EVENT = `${PREFIX}event`

/**
 * Main thread → background: "I am up, are you?".
 *
 * The handshake exists because the two chunks have no defined start order and
 * the main-thread one usually wins — the engine calls `renderPage` to get a
 * first screen up, and the background chunk may not have run yet. Without a
 * handshake, every call a component makes during its build would be dispatched
 * into a context with nothing listening and silently never answered.
 */
export const HELLO = `${PREFIX}hello`

/**
 * Background → main thread: the bridge is installed and serving.
 *
 * Sent both on install and in answer to a {@link HELLO}, so whichever side
 * comes up second completes the handshake and neither has to be first.
 */
export const READY = `${PREFIX}ready`

/**
 * Which shape the *native* method has — not which shape the JavaScript call
 * has, which is always a promise because it crosses a thread either way.
 *
 * Lynx native modules come in exactly these two forms. A method either returns
 * its result directly, or it takes a trailing callback and returns nothing;
 * there is no promise-returning form on any platform. The caller has to say
 * which, because the background half cannot tell by looking: a method that
 * returns `undefined` and a method that will call back later are the same
 * value at the call site.
 *
 * `exists` is the odd one out and is not a call at all — it asks the background
 * half whether a module (and optionally a method on it) is linked, and invokes
 * nothing. It rides this message rather than a channel of its own so that
 * feature detection inherits the id correlation and the pre-handshake queueing
 * already built here.
 */
export type NativeCallForm = 'return' | 'callback' | 'exists'

/** The payload of a {@link CALL}. */
export type CallPayload = {
  readonly id: number
  readonly module: string
  readonly method: string
  readonly args: readonly unknown[]
  readonly form: NativeCallForm
}

/**
 * The payload of a {@link REPLY}.
 *
 * A failure crosses as a `string` rather than as an `Error`, because an `Error`
 * does not survive serialisation — it arrives as `{}`, which is the least
 * useful thing a failed call could hand back. The main-thread half rebuilds a
 * real `Error` from the message so a caller's `catch` gets what it expects.
 */
export type ReplyPayload =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly error: string }

/** The payload of a {@link LISTEN} or an {@link UNLISTEN}. */
export type SubscribePayload = {
  readonly name: string
}

/** The payload of an {@link EVENT}. */
export type EventPayload = {
  readonly name: string
  readonly args: readonly unknown[]
}

/**
 * Reads the `data` off a message as `T`.
 *
 * Every payload on this wire has already crossed a serialisation boundary the
 * compiler cannot see through, so this is an assertion rather than a check —
 * named so the assertion is visible at the call sites that make it, instead of
 * being an inline `as` that reads like a fact.
 */
export const payloadOf = <T>(message: ContextMessage): T | undefined => message.data as T | undefined
