# `@amritk/mini-lynx-preview`

Lynx's Element PAPI, implemented over the DOM — so a
[`@amritk/mini-lynx`](../mini-lynx) app runs in a browser tab with nothing about
it changed.

```sh
bun add -d @amritk/mini-lynx-preview
```

```ts
import { mount, pageElement, setEngine } from '@amritk/mini-lynx'
import { createDomPapi } from '@amritk/mini-lynx-preview'

setEngine(createDomPapi({ root: document.getElementById('app') ?? undefined }))
mount(pageElement(), App)
```

On a device that entry file is `renderPage(App)` and no shim at all, because
there the engine is already injected as globals and calls the entry point
itself. Here there is no engine, so the app supplies one.

## Why an engine and not a renderer

A Lynx app talks to exactly one thing: about thirty functions that create
elements, mutate them, and flush. That is a small enough boundary for a browser
to simply **be** the engine — which is not a workaround but the sanctioned shape
of a web target. Lynx does it too, in `@lynx-js/web-platform`, where `web-core`
reimplements the PAPI over custom elements. This is a small, honest subset of
the same idea, sized for a dev loop.

The consequence worth internalising: the runtime above this line is the code
that ships to a device, byte for byte. There is no second renderer to keep in
step, and no framework-level abstraction with two implementations that can
disagree. **The browser is emulating Lynx**, so when the two disagree the
preview is what is wrong.

## What it cannot show you

Four things, all worth knowing before trusting a green preview:

- **A missing flush.** `__FlushElementTree` is a no-op here because the DOM is
  eager, so a mutation that never gets committed still appears.
- **Anything element-creation-specific.** On a device `__CreateElement('view')`
  builds a node that is not really a view and quietly does less; in a browser
  every tag is a custom element and the distinction does not exist. The engine's
  own web port has the same blind spot.
- **Layout.** Linear is approximated with flex. `linear-weight` and the
  `relative-*` family have no CSS equivalent at all.
- **The background thread.** A string event handler names a function in a
  JavaScript context a browser does not have. Those are reported through
  `onPublishEvent` — one console warning per handler name by default — rather
  than silently dropped. Worklet handlers, which is what this runtime registers,
  run normally.

`NativeModules` lives in that same background context, so it is not this
package's boundary either: the bridge is [`@amritk/mini-lynx-native`](../mini-lynx-native),
and each `@amritk/lynx-*` package publishes the fake its own suite runs against.

## The rest of the surface

```ts
installLynxReset(document)          // the scoped stylesheet; createDomPapi already calls it
LYNX_ROOT_ATTRIBUTE                 // put it on a container you create for <Portal>
createVisualViewportEmitter()       // trackKeyboard({ emitter }) — the keyboard, from visualViewport
```

Elements keep their Lynx names — `__CreateElement('view')` produces `<view>` —
so the browser inspector shows the tree the Lynx devtool would, attribute for
attribute. The cost is that the browser knows nothing about any of those tags,
which is what the reset is for. It is scoped to the page element, so the page
around the preview keeps its ordinary web defaults.

The keyboard needs the extra line because Lynx's `keyboardstatuschanged` is
unsupported on the web: without it `<KeyboardAvoiding>` would sit there, correct
and motionless, and the preview would look like the feature was broken.

## The other loop

This is the loop with no phone in it. The one with a phone is
[`@amritk/mini-lynx-rsbuild-plugin`](../mini-lynx-rsbuild-plugin) — the rspeedy
build, a real `.lynx.bundle` and a QR code Lynx Explorer scans. They are
complements rather than alternatives: the preview is where an edit is cheap, and
the device is what the four blind spots above are a list of reasons to check.

[`create-mini-lynx`](../create-mini-lynx) scaffolds a starter with both already
wired, over one `src/app.tsx`:

```sh
bun create @amritk/mini-lynx my-app
```

`AI.md` next to this file is the version written for a coding agent.
