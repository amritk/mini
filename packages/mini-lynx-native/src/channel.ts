import type { ContextMessage } from './context-proxy'
import { peerContext } from './current-context'
import {
  CALL,
  EVENT,
  type EventPayload,
  HELLO,
  LISTEN,
  type NativeCallForm,
  payloadOf,
  READY,
  REPLY,
  type ReplyPayload,
  UNLISTEN,
} from './protocol'
import { warn } from './warn'

/**
 * The main-thread half of the bridge: one channel to the background context,
 * with calls correlated by id and emitter events fanned back out.
 *
 * ## Why any of this exists
 *
 * `NativeModules` is a background-thread global. `@amritk/mini-lynx` renders on
 * the main thread, because the Element PAPI is a main-thread API. Those two
 * facts do not overlap anywhere, so a component that wants a native capability
 * cannot simply call one — the object it would call is not in its context, and
 * reaching for it gets `undefined` rather than an error worth reading.
 *
 * So the call is carried. This module owns the main-thread end of the wire and
 * `background/install-bridge.ts` owns the other, and between them a component
 * gets a promise instead of a thread.
 *
 * ## The handshake, and why it is not optional
 *
 * The two chunks have no defined start order, and in practice the main-thread
 * one wins: the engine calls `renderPage` to get a first screen up, and the
 * background chunk may not have run yet. A call dispatched into a context with
 * nothing listening is not an error on either side — it is a message that goes
 * nowhere and a promise that never settles, which is the silent failure this
 * repository works hardest to avoid.
 *
 * So the channel says {@link HELLO} when it attaches and holds every call until
 * it hears {@link READY}. The background half answers a `HELLO` and also
 * announces itself on install, so whichever side comes up second completes the
 * handshake and neither has to be first.
 *
 * ## What a reload does to a call in flight
 *
 * Nothing good, and deliberately not papered over. If the background context is
 * torn down between a call and its reply, that reply is never coming; the
 * channel re-sends *subscriptions* on a fresh `READY` because they are
 * idempotent, and does **not** re-send calls, because a native method that
 * charged a card or scheduled a notification is not something to retry on the
 * channel's initiative. Call {@link resetNativeChannel} to settle the
 * stragglers, which is what a teardown should do anyway.
 */

/** A promise waiting on one reply, kept until the id it was filed under comes back. */
type Pending = {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: unknown) => void
}

/** A listener on a forwarded emitter event. Arguments arrive as the emitter published them. */
export type NativeEventListener = (...args: readonly unknown[]) => void

let attached = false
let ready = false
let nextId = 1

const pending = new Map<number, Pending>()
const listeners = new Map<string, Set<NativeEventListener>>()

/**
 * Calls made before the background half answered. Only calls queue here:
 * subscriptions are rebuilt from `listeners` on every `READY`, so queueing them
 * too would send each one twice.
 */
const queued: ContextMessage[] = []

/** Sends now, with no queueing. The peer is re-resolved per message so a swapped context is picked up. */
const dispatch = (message: ContextMessage): void => {
  const peer = peerContext('main-thread')
  if (!peer) {
    warn('the peer context disappeared; dropping a message of type:', message.type)
    return
  }
  peer.dispatchEvent(message)
}

/**
 * Settles the promise filed under the reply's id.
 *
 * A reply for an id nobody holds is warned about rather than thrown on: by the
 * time this runs the message has already crossed a thread, and the likeliest
 * cause is a {@link resetNativeChannel} that raced the reply home — an ordinary
 * teardown, not a mistake.
 */
const onReply = (message: ContextMessage): void => {
  const reply = payloadOf<ReplyPayload>(message)
  if (!reply) return
  const settle = pending.get(reply.id)
  if (!settle) {
    warn('a reply arrived for a call nobody is waiting on:', reply.id)
    return
  }
  pending.delete(reply.id)
  if (reply.ok) settle.resolve(reply.value)
  else settle.reject(new Error(reply.error))
}

/**
 * Fans a forwarded event out to its listeners.
 *
 * This function is entered from the engine's message delivery rather than from
 * an app's own call stack, so a throw leaving it unwinds into native code with
 * no defined behaviour. Each listener is therefore guarded individually and the
 * fan-out continues past one that threw — the same bargain
 * `@amritk/mini-lynx`'s `guard` makes at its own engine-facing boundaries, for
 * the same reason. The set is copied first so a listener that unsubscribes
 * during delivery cannot mutate the collection being walked.
 */
const onEvent = (message: ContextMessage): void => {
  const event = payloadOf<EventPayload>(message)
  if (!event) return
  const bound = listeners.get(event.name)
  if (!bound) return
  for (const listener of [...bound]) {
    try {
      listener(...event.args)
    } catch (error) {
      warn(`a listener for the native event "${event.name}" threw:`, error)
    }
  }
}

/**
 * The background half is serving: replay the subscriptions and let the queued
 * calls go.
 *
 * Subscriptions are replayed rather than assumed because a `READY` may be the
 * *second* one — a background context that was torn down and rebuilt has an
 * emitter with no listeners on it, and the main thread is the only side that
 * still knows what was subscribed. The background half keys them by name, so a
 * replay for a subscription it already has is a no-op.
 */
const onReady = (): void => {
  ready = true
  for (const name of listeners.keys()) dispatch({ type: LISTEN, data: { name } })
  const backlog = queued.splice(0, queued.length)
  for (const message of backlog) dispatch(message)
}

/**
 * Attaches to the peer context and starts the handshake, at most once.
 *
 * Attaching is lazy so that importing this package costs nothing and so that a
 * test can install its fake contexts after the module has already been loaded.
 * A missing peer leaves `attached` false rather than throwing, so the next call
 * tries again — on a device the peer is always there, and in a test it appears
 * the moment `setPeerContext` runs.
 */
const attach = (): void => {
  if (attached) return
  const peer = peerContext('main-thread')
  if (!peer) {
    warn('no peer context yet; native calls will queue until one is available')
    return
  }
  attached = true
  peer.addEventListener(REPLY, onReply)
  peer.addEventListener(EVENT, onEvent)
  peer.addEventListener(READY, onReady)
  peer.dispatchEvent({ type: HELLO })
}

/**
 * Invokes a native method and resolves with its result.
 *
 * Internal — `call-native.ts` and `call-native-async.ts` are the two public
 * spellings, and they differ only in the `form` they pass.
 */
export const sendCall = (
  module: string,
  method: string,
  args: readonly unknown[],
  form: NativeCallForm,
): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    const message: ContextMessage = { type: CALL, data: { id, module, method, args, form } }
    attach()
    if (ready) dispatch(message)
    else queued.push(message)
  })

/**
 * Subscribes to an event the background half forwards, and returns the
 * unsubscribe.
 *
 * Internal — `on-native-event.ts` is the public spelling.
 *
 * The `LISTEN` goes over the wire only for the *first* listener on a name and
 * the `UNLISTEN` only when the last one leaves, so a screen with ten
 * subscriptions to one event costs one emitter listener in the background
 * context rather than ten.
 */
export const subscribe = (name: string, listener: NativeEventListener): (() => void) => {
  attach()
  const existing = listeners.get(name)
  if (existing) existing.add(listener)
  else {
    listeners.set(name, new Set([listener]))
    if (ready) dispatch({ type: LISTEN, data: { name } })
  }

  return () => {
    const bound = listeners.get(name)
    if (!bound?.delete(listener)) return
    if (bound.size > 0) return
    listeners.delete(name)
    if (ready) dispatch({ type: UNLISTEN, data: { name } })
  }
}

/**
 * Detaches the channel, rejects every call still in flight, and forgets every
 * subscription.
 *
 * Two callers want this: a test, which needs a clean channel per case, and an
 * app tearing a page down, where a promise nobody will ever settle is a leak
 * that only shows up after the second reload. Rejecting is the honest outcome —
 * the reply genuinely is not coming — and it gives the awaiting code a `catch`
 * to run instead of a promise that sits forever.
 */
export const resetNativeChannel = (): void => {
  if (attached) {
    const peer = peerContext('main-thread')
    peer?.removeEventListener(REPLY, onReply)
    peer?.removeEventListener(EVENT, onEvent)
    peer?.removeEventListener(READY, onReady)
  }
  attached = false
  ready = false
  nextId = 1

  const inflight = [...pending.values()]
  pending.clear()
  listeners.clear()
  queued.length = 0
  for (const settle of inflight) {
    settle.reject(new Error('the native channel was reset before this call was answered'))
  }
}
