# mini-lynx app

A [`@amritk/mini-lynx`](https://github.com/amritk/mini/tree/main/packages/mini-lynx)
app: signals over Lynx, with real elements created once and mutated forever —
no virtual tree, no diffing, no re-render.

```sh
bun install
bun run dev          # the app in a device frame, in a browser tab
bun run dev:device   # rspeedy: two QR codes, and the app on your phone
```

**Two loops, one `src/app.tsx`.** Which you reach for is a question about the
change you are making, not about the project.

## `bun run dev` — the browser preview

The app runs on a **browser implementation of Lynx's Element PAPI**
([`@amritk/mini-lynx-preview`](https://github.com/amritk/mini/tree/main/packages/mini-lynx-preview)).
A Lynx app talks to about thirty engine functions and nothing else, so supplying
those from a browser is enough to run the app unchanged — same tags, same
attribute names, same event names, same dispatch. There is a size picker above
the frame, because Lynx has no `@media` and therefore no breakpoint to fall back
on: a layout either fits the width the device hands it or it does not.

The relationship is not symmetric: **the browser is emulating Lynx**, so when
the two disagree the preview is what is wrong. Four things it is structurally
blind to:

- **A missing flush.** The DOM is eager, so a mutation that never gets committed
  still appears here and renders nothing on a device.
- **Element creation.** On a device `__CreateElement('view')` builds a node that
  is not really a view and quietly does less; in a browser every tag is a custom
  element and the distinction does not exist.
- **Layout.** Linear is approximated with flex; `linear-weight` and the
  `relative-*` family have no CSS equivalent at all.
- **The background thread.** `NativeModules` lives in a second JavaScript
  context a browser does not have.

Each of those is a reason to run the other loop before believing a screen.

## `bun run dev:device` — the phone

`rspeedy dev` builds a real `.lynx.bundle` and prints two QR codes. Scan either
with **Lynx Explorer** — the second one carries Explorer's `?fullscreen=true`
flag, so the screen is your app rather than the shell around it; press `a` in
the terminal to switch. Saving a file rebuilds and reloads the page on the
device.

Explorer is Lynx's own host application; the Lynx docs are where to get a build
of it for your platform. `bun run build:device` writes the same template to
`dist/` without the server.

The build is [`@amritk/mini-lynx-rsbuild-plugin`](https://github.com/amritk/mini/tree/main/packages/mini-lynx-rsbuild-plugin),
configured in `lynx.config.ts`. What it does, and which links in this loop are
verified rather than assumed, is
[`docs/mini-lynx-explorer.md`](https://github.com/amritk/mini/blob/main/docs/mini-lynx-explorer.md).

## Layout

```
lynx.config.ts          The device build: rspeedy, the QR plugin, pluginMiniLynx
vite.config.ts          The browser preview build
src/
  app.tsx               The app. Both targets build this file, unchanged
  styles.css            Real CSS, because Lynx has real CSS. Both targets, too
  main-thread.ts        The device entry: renderPage(App)
  background.ts         The device's background chunk: the native bridge
  preview/
    main.ts             The browser entry — the only file that knows what a browser is
    frame.css           The phone frame. Browser chrome; never ships
    device-switcher.ts  The size picker above the frame. Also chrome
```

`tsconfig.json` covers everything except `src/preview/`, **without** the DOM
libs, and `tsconfig.preview.json` is that one directory with them. That split is
not decoration: Lynx's main-thread context is not a browser, so a `document` in
app code compiles and then fails on the only target that ships. `bun run
types:check` runs both passes.

## Why two chunks on the device

A Lynx template carries two code slots, and they are two different JavaScript
contexts:

- The **main thread** runs the Element PAPI, which is what this runtime drives.
  Your components, your tree, your handlers — a handler here runs in the same
  frame as the gesture, which is a gift and the reason heavy work in one blocks
  rendering.
- The **background thread** is the only place `NativeModules` and
  `GlobalEventEmitter` exist.

`src/background.ts` is the far end of that wire: one `installNativeBridge()`.
Nothing in the starter calls a native module yet, but the file is there because
a missing background chunk is invisible until something does.

## The three things that trip people up

**A component runs once.** It creates elements and returns them; the signals it
read keep mutating those same elements forever. So a changing value reaches an
element as a *getter* — `text={() => String(count())}` — and never as a called
value. `text={String(count())}` compiles, renders once, and then never changes
again.

**Text does not inherit.** Lynx's CSS inheritance is off by default: `color` and
`font-size` on a container reach nothing inside it, so every `<text>` carries its
own. Custom properties do inherit, which is why the palette in `styles.css` is
expressed as variables.

**A `<view>` is already a flex column.** Stacking costs no CSS;
`flex-direction: row` is what costs a line.

## Where to go next

Everything below is already installed — these are subpaths of the runtime you
have:

| Import | What it gives you |
| --- | --- |
| `@amritk/mini-lynx/flow` | `Show`, `Switch`/`Match`, `For`, `Index`, `Dynamic` |
| `@amritk/mini-lynx/router` | A router, `RouteView`, `RouteStack`, typed params |
| `@amritk/mini-lynx/forms` | `createForm`, `Field`, JSON Schema validation |
| `@amritk/mini-lynx/query` | `createQuery` over `@tanstack/query-core` |
| `@amritk/mini-lynx/keyboard` | The soft keyboard as a signal, and the layouts that move out of its way |
| `@amritk/mini-lynx/composition` | `createContext`, `Portal`, `ErrorBoundary` |

The keyboard needs one extra line in the preview, because Lynx's
`keyboardstatuschanged` event is unsupported on the web:

```ts
import { trackKeyboard } from '@amritk/mini-lynx/keyboard'
import { createVisualViewportEmitter } from '@amritk/mini-lynx-preview'

trackKeyboard({ emitter: createVisualViewportEmitter() })   // on a device: trackKeyboard()
```

For the native side — notifications, location, dialogs, deep links, secure
storage — see the `@amritk/lynx-*` packages. Each publishes a fake its own test
suite runs against, so a browser can drive the shipping facade rather than a
reimplementation of it. Those calls reach the device through `src/background.ts`.

Before shipping anything real, read the runtime's own
[caveats about what has and has not run on a device](https://github.com/amritk/mini/tree/main/packages/mini-lynx#readme).

Kitchen-sink examples of all of it:
[`apps/playground-mini-lynx`](https://github.com/amritk/mini/tree/main/apps/playground-mini-lynx).
