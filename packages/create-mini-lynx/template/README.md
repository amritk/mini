# mini-lynx app

A [`@amritk/mini-lynx`](https://github.com/amritk/mini/tree/main/packages/mini-lynx)
app: signals over Lynx, with real elements created once and mutated forever —
no virtual tree, no diffing, no re-render.

```sh
bun install
bun run dev
```

That serves the app inside a device frame at the URL Vite prints.

## What you are looking at

The app is running on a **browser implementation of Lynx's Element PAPI**
([`@amritk/mini-lynx-preview`](https://github.com/amritk/mini/tree/main/packages/mini-lynx-preview)),
not on a device. A Lynx app talks to about thirty engine functions and nothing
else, so supplying those from a browser is enough to run the app unchanged —
same tags, same attribute names, same event names, same dispatch.

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

## Layout

```
src/
  app.tsx               The app. Every line of it runs unchanged on a device
  styles.css            Real CSS, because Lynx has real CSS. Ships to a device
  device.ts             The device entry: renderPage(App), and nothing else
  preview/
    main.ts             The browser entry — the only file that knows what a browser is
    frame.css           The phone frame. Browser chrome; never ships
    device-switcher.ts  The size picker above the frame. Also chrome
```

The split is the point. Anything under `preview/` is a stand-in; everything
above it is the app.

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

## Getting onto a real device

This starter does not build a Lynx bundle, and it would be lying to you if it
pretended to: that needs a Lynx host application (a
[Sparkling](https://github.com/tiktok/Sparkling)- or LynxExplorer-style shell
built for iOS or Android) and a bundler that emits Lynx's template format. What
this project gives you is the half that is genuinely target-free — `src/app.tsx`
and `src/styles.css` — plus `src/device.ts`, which is the two-line entry point a
device build uses.

When you wire one up, the app does not change. The entry does:

```ts
// src/device.ts — the whole file
import { renderPage } from '@amritk/mini-lynx'
import { App } from './app'

renderPage(App)
```

Before shipping anything real, read the runtime's own
[caveats about what has and has not run on a device](https://github.com/amritk/mini/tree/main/packages/mini-lynx#readme).
Main-thread event dispatch through framework-defined worklet tokens is the one
to prototype first.

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
suite runs against, so a preview drives the shipping facade rather than a
reimplementation of it.

Kitchen-sink examples of all of it:
[`apps/playground-mini-lynx`](https://github.com/amritk/mini/tree/main/apps/playground-mini-lynx).
