# AI.md — @amritk/mini-lynx-native

For an LLM consuming this package. Editing the repo instead? See
[`AGENTS.md`](./AGENTS.md).

## Mental model

Lynx runs your code in **two JavaScript contexts**. `NativeModules` and
`GlobalEventEmitter` exist only in the **background** one. `@amritk/mini-lynx`
renders in the **main** one, because the Element PAPI is a main-thread API.

They do not overlap. A component reaching for `NativeModules` gets `undefined` —
not an error, just an absent property.

This package carries calls from the main thread to the background one and events
back. It is a wire, nothing more: it invents no capability and wraps no specific
module.

## Setup is two lines and both are required

```ts
// background chunk
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
installNativeBridge()
```

```ts
// main-thread chunk
import { callNative } from '@amritk/mini-lynx-native'
const level = await callNative<number>('BatteryModule', 'level')
```

If you only write the second one, every call queues forever and nothing says
why. This is the single most likely thing to get wrong.

## The surface, in full

```ts
import {
  callNative,
  callNativeAsync,
  isNativeModuleAvailable,
  onNativeEvent,
  resetNativeChannel,
  setPeerContext,
} from '@amritk/mini-lynx-native'

callNative<T>(module: string, method: string, ...args: unknown[]): Promise<T>
callNativeAsync<T>(module: string, method: string, ...args: unknown[]): Promise<T>
isNativeModuleAvailable(module: string, method?: string): Promise<boolean>
onNativeEvent(name: string, listener: (...args: unknown[]) => void): () => void
resetNativeChannel(): void
setPeerContext(proxy: ContextProxy | null): void

import { installNativeBridge } from '@amritk/mini-lynx-native/background'
installNativeBridge(options?: InstallBridgeOptions): () => void

import { createFakeContexts, createFakeEmitter } from '@amritk/mini-lynx-native/testing'
```

## Gotchas

- **`callNative` vs `callNativeAsync` is about the NATIVE method's shape, not
  the JavaScript one.** Both return a promise. Use `callNative` when the native
  method returns its result; use `callNativeAsync` when it takes a trailing
  callback. The two wrong ways round fail differently: `callNativeAsync` on a
  *returning* method appends a callback nothing ever invokes, so the promise
  **never settles**; `callNative` on a *callback* method invokes it with the
  callback missing, so it settles with whatever the method returned — usually
  `undefined`, or a rejection if the native side reached for the argument that
  was not there.
- **A native value cannot be read during a component's build.** Everything
  crosses a thread. Bind a signal, start the call, write the signal when it
  settles — do not try to `await` your way into a synchronous render.
- **Only JSON crosses.** No functions, no class instances, no `Date`. Pass
  timestamps as numbers.
- **`callNativeAsync` settles on the FIRST callback invocation.** A native
  method that calls back repeatedly loses everything after the first. For
  streams, publish from native through `sendGlobalEvent` and use
  `onNativeEvent`.
- **A rejection means the call could not be MADE** — module not linked, method
  not on it, native threw. A native method that came back with `{ ok: false }`
  is a *resolved* promise; reading it is your job. Lynx has no error convention
  for callbacks.
- **`onNativeEvent` arguments are `unknown`** because `sendGlobalEvent`'s are.
  Narrow once at the edge of your own code rather than casting at each use.
- **Always unsubscribe.** The returned function drops the listener and, when it
  was the last on that name, detaches from the emitter. Register it with
  `onCleanup`; a screen that never lets go leaks across every navigation.
- **Feature-detect before offering a control.** A Lynx bundle can run inside a
  host that linked a module and one that did not. `isNativeModuleAvailable` is
  how you hide a screen rather than fail when it is pressed.
- **Nothing here is reactive.** No signals, deliberately — a second edge onto the
  signal engine gives a consumer two reactive graphs that cannot see each
  other's writes. Wire a promise into your own signal in one line.
