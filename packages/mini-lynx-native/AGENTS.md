# AGENTS.md — @amritk/mini-lynx-native

Contributor guide for AI agents editing **this package**. Repo-wide rules:
[`../../AGENTS.md`](../../AGENTS.md) and [`../../CLAUDE.md`](../../CLAUDE.md).
Consuming the package instead? See [`AI.md`](./AI.md).

The wire between Lynx's two script contexts, so a main-thread
`@amritk/mini-lynx` tree can reach background-thread `NativeModules`.

## Commands

```bash
bun run --filter='@amritk/mini-lynx-native' test
bun run --filter='@amritk/mini-lynx-native' types:check
bun run --filter='@amritk/mini-lynx-native' build
```

## Layout

```
src/
  index.ts              The `.` entry: the main-thread API
  context-proxy.ts      ContextProxy — the whole platform boundary, as a type
  current-context.ts    setPeerContext / peerContext, and the side→accessor mapping
  protocol.ts           Channel names and payload shapes, shared by both halves
  channel.ts            The main-thread half: correlation, handshake, queueing, fan-out
  call-native.ts        A native method that returns its result
  call-native-async.ts  A native method that takes a trailing callback
  is-native-module-available.ts  Feature detection over the same wire
  on-native-event.ts    GlobalEventEmitter subscription, forwarded
  warn.ts               Recoverable-mistake reporting, without assuming a console
  background/
    index.ts            The `/background` subpath — install this in the background chunk
    install-bridge.ts   Serves calls against NativeModules, forwards emitter events
    native-globals.ts   NativeModules and GlobalEventEmitter, as types plus lookups
  testing/
    index.ts            The `/testing` subpath
    create-fake-contexts.ts  Two proxies wired to each other — the reference implementation
    create-fake-emitter.ts   A GlobalEventEmitter with a listener count
```

## Invariants — do not break these

- **The thread split is the reason this package exists.** Lynx says native
  modules are background-only, and the PAPI `@amritk/mini-lynx` drives is
  main-thread. Nothing here may "optimise" that away with a synchronous path;
  there isn't one, and an API that implied otherwise would be lying about the
  only thing that matters.
- **The peer proxy always names the OTHER context.** Main thread reaches the
  background through `lynx.getJSContext()`; the background reaches the main
  thread through `lynx.getCoreContext()`. Getting it backwards produces a
  channel that attaches without error and never delivers anything.
  `current-context.ts` is the one place that mapping is written.
- **The handshake is not optional.** The two chunks have no defined start order
  and the main-thread one usually wins, so a call dispatched before the
  background half is serving would be a message that goes nowhere and a promise
  that never settles. `HELLO`/`READY` exist for that, and calls queue until
  `READY`. `channel.test.ts` pins it — *"queues calls made before the background
  half is installed"*.
- **Subscriptions are replayed on every `READY`; calls are not.** A `READY` may
  be the second one, from a background context that was torn down and rebuilt
  with an emitter that has nothing on it, and the main thread is the only side
  that still knows what was subscribed. Calls are deliberately *not* replayed: a
  native method that charged a card or posted a notification is not something
  the channel may retry on its own initiative.
- **Nothing entered from the engine may throw back into it.** Three functions
  here are called by the engine's message delivery rather than by an app's own
  stack — `onReply`, `onEvent` and everything inside `installNativeBridge`'s
  listeners. A throw leaving one unwinds into native code with no defined
  behaviour. Each guards, reports and carries on, exactly as
  `@amritk/mini-lynx`'s `guard` does at its own boundaries. **Any new
  engine-called callback owes the same treatment.**
- **A fan-out copies the set before walking it.** A listener that unsubscribes
  during delivery would otherwise mutate the collection being iterated. Both
  `channel.ts` and the fake reproduce this.
- **One emitter listener per event name, released when the last subscriber
  leaves.** A screen with ten subscriptions to one event costs one subscription
  in the background context. This is invisible in behaviour — a leak looks like
  working code until it has been running a while — which is why
  `createFakeEmitter` exposes `listenerCount` and the suite asserts on it.
- **The package compiles with no platform library at all.** `lib: ["ESNext"]`,
  `types: []`. Neither of Lynx's contexts is a browser or a Node process, so a
  stray `document` or `Buffer` must fail here rather than on a device. That is
  why `warn.ts` declares the slice of `console` it uses.
- **The platform types are declared, not imported.** `ContextProxy`,
  `NativeModuleRegistry` and `NativeEventEmitter` are written out here rather
  than taken from `@lynx-js/types`, because they are what a test substitutes and
  a package whose only dependency is a types-only optional peer cannot require a
  consumer to install one before a fake will compile.
- **This package has no runtime dependencies, and should stay that way.** In
  particular it must not reach `alien-signals`: a second edge onto the signal
  engine is how a consumer ends up with two reactive graphs that cannot see each
  other's writes. The surface is promises and subscriptions; an app turns those
  into signals in one line.

## What the suite cannot tell you

Everything here runs against `createFakeContexts`, which delivers messages
**synchronously**. That is deliberate — see the note in the file — and it means
the suite proves the protocol, the correlation and the handshake, and proves
nothing about real cross-thread timing. It also has never run against a real
`lynx` object. Treat a green suite as "the logic is right", not as "this works
on a device".

Add a changeset for every change (`bunx changeset`).
