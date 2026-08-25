# @amritk/starter-mini-lynx

The smallest **real** `@amritk/mini-lynx` app: it builds to a `.lynx.bundle`,
`rspeedy dev` serves it, and Lynx Explorer runs it from a QR code.

Everything else in this repo runs in a browser or a test process. This one is
for a phone.

```bash
bun install
bun run dev     # prints two QR codes; scan either with Lynx Explorer
bun run build   # dist/main.lynx.bundle
bun run test    # the app, driven through the fake Element PAPI — no device
```

The loop it belongs to, including where to get Explorer and what to check when
the phone shows nothing, is [`docs/mini-lynx-explorer.md`](../../docs/mini-lynx-explorer.md).

## The four files

```
lynx.config.ts        rspeedy: the entry, the QR plugin, pluginMiniLynx
src/main-thread.tsx   the main-thread chunk — the whole app, and the entry
src/background.ts     the background chunk — installs the native bridge
src/app.css           real CSS, compiled into the template by the encoder
```

There is no `App.tsx` importing an `index.tsx`, and no framework entry to
extend. `renderPage(App)` at the bottom of `main-thread.tsx` **is** the entry:
it installs the global the engine calls once at startup.

## Why two chunks

A Lynx bundle carries two code slots, and they are two different JavaScript
contexts on the device:

- The **main thread** runs the Element PAPI, which is what `@amritk/mini-lynx`
  drives. Your components, your tree, your event handlers — a handler here runs
  in the same frame as the gesture that triggered it.
- The **background thread** is the only place `NativeModules` and
  `GlobalEventEmitter` exist.

`src/background.ts` is one line: `installNativeBridge()`, the background half of
[`@amritk/mini-lynx-native`](../../packages/mini-lynx-native). The screen
labelled *background chunk* is that wire being exercised — the main-thread side
asks whether a module is reachable, the answer crosses the thread boundary, and
a signal is written when it lands. A `no answer` there means the background
chunk is not in the bundle; on a device it should say `bridge answered`.

## What each screen is showing

| Card | What it exercises |
| --- | --- |
| the counter | a signal driving a `<text>` binding, and one element mutated rather than a subtree rebuilt |
| `globalProps` | the platform's own values as a signal — theme, locale, whatever your host pushes |
| `background chunk` | the two-chunk build, end to end, over the native bridge |

## Copy it

This directory is a starting point, not a demo of a framework's features. To
take it: copy the four files, replace `workspace:*` with the published versions
of `@amritk/mini-lynx`, `@amritk/mini-lynx-native` and
`@amritk/mini-lynx-rsbuild-plugin`, and delete this README.

Private and never published; it exists to be read and to be the thing this
repo's build plugin is tried against.
