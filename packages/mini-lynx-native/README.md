# @amritk/mini-lynx-native

The thread hop between a main-thread `@amritk/mini-lynx` tree and Lynx's
background-thread `NativeModules`, as a typed request/reply channel.

## The problem

Lynx is explicit about it: *"native modules can only be used in Background
Thread Scripting."* `NativeModules` and `GlobalEventEmitter` are background
globals.

`@amritk/mini-lynx` renders on the **main** thread, because the Element PAPI it
drives is a main-thread API.

Those two facts do not overlap. A component reaching for `NativeModules` finds
`undefined` — no error, no warning, just a property that is not there.

This package is the wire between them.

## Install

```sh
bun add @amritk/mini-lynx-native
```

## Setup

Two lines, in two chunks.

```ts
// background chunk — once, at startup
import { installNativeBridge } from '@amritk/mini-lynx-native/background'

installNativeBridge()
```

```tsx
// main-thread chunk — anywhere in a component
import { callNative } from '@amritk/mini-lynx-native'

const level = await callNative<number>('BatteryModule', 'level')
```

Calls made before the background half is installed are **queued**, not lost —
the main-thread chunk usually runs first, because the engine calls `renderPage`
to get a first screen up.

## API

| Function | What it does |
| --- | --- |
| `callNative(module, method, ...args)` | Invokes a native method that **returns** its result. |
| `callNativeAsync(module, method, ...args)` | Invokes a native method that takes a **trailing callback**. |
| `isNativeModuleAvailable(module, method?)` | Feature-detects without invoking anything. |
| `onNativeEvent(name, listener)` | Subscribes to `sendGlobalEvent`. Returns the unsubscribe. |
| `resetNativeChannel()` | Detaches and rejects everything in flight. For teardown and tests. |
| `setPeerContext(proxy)` | Substitutes the context. For tests. |

`callNative` and `callNativeAsync` differ in the shape of the **native** method,
not the JavaScript one — both return promises, because both cross a thread.

### Everything is async, including the synchronous things

A native method that returns immediately still reaches you a thread later. The
practical consequence: **a native value cannot be read during a component's
build.** Bind a signal, start the call, write the signal when it settles.

```tsx
const level = signal(0)
callNative<number>('BatteryModule', 'level').then(level)

const View = () => <text>{() => `${level()}%`}</text>
```

### What crosses

Arguments and results are serialised by the engine, so they must be plain JSON.
No functions, no class instances, no `Date`. A failure crosses as a message and
is rebuilt into an `Error` on the main thread — an `Error` itself would arrive
as `{}`.

## Testing

`@amritk/mini-lynx-native/testing` ships the two fakes both halves run against,
so a bridge-backed module can be tested with no device:

```ts
import { resetNativeChannel, setPeerContext } from '@amritk/mini-lynx-native'
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
import { createFakeContexts, createFakeEmitter } from '@amritk/mini-lynx-native/testing'

const contexts = createFakeContexts()
const emitter = createFakeEmitter()
setPeerContext(contexts.mainThread)
const uninstall = installNativeBridge({
  peer: contexts.background,
  emitter,
  modules: { BatteryModule: { level: () => 87 } },
})
```

## Caveats worth knowing before you build on it

- **The app owns the background half.** This package cannot inject itself into a
  chunk it cannot see; which module runs in the background context is a bundler
  question. One line, once.
- **A native method that never calls back leaves a promise pending forever.**
  The wire cannot detect it. `resetNativeChannel()` settles the stragglers.
- **Calls are not retried across a background reload.** Subscriptions are
  replayed because they are idempotent; a native method that charged a card is
  not something the channel should retry on its own initiative.

## Licence

MIT
