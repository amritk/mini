# AI.md — @amritk/mini-lynx-preview

For an LLM consuming this package. Editing the repo instead? See
[`AGENTS.md`](./AGENTS.md).

## Mental model

A `@amritk/mini-lynx` app talks to exactly one thing: Lynx's **Element PAPI**,
about thirty functions a device injects as globals. This package implements
those functions over the DOM, so the same app runs in a browser tab with nothing
about it changed — same tags, same attribute names, same event names, same
worklet dispatch. It is a *dev-time* dependency: a device build never imports it.

The relationship is not symmetric. **The browser is emulating Lynx**, so when
the two disagree the preview is what is wrong.

## Minimal example

```ts
import { mount, pageElement, setEngine } from '@amritk/mini-lynx'
import { createDomPapi } from '@amritk/mini-lynx-preview'

setEngine(createDomPapi({ root: document.getElementById('app') ?? undefined }))
mount(pageElement(), App)
```

On a device those three lines are `renderPage(App)` and nothing else: the engine
is already injected and calls the entry point itself.

The wiring stays in **your** app on purpose. This package imports
`@amritk/mini-lynx` for types only and holds no runtime reference to it, so it
cannot call `setEngine` on a second copy of the runtime and leave the copy your
app imported with no engine at all — the failure that shape of helper produces
is a blank screen with no error in it.

## The surface, in full

```ts
import {
  createDomPapi,
  createVisualViewportEmitter,
  installLynxReset,
  LYNX_ROOT_ATTRIBUTE,
  type DomPapiOptions,
} from '@amritk/mini-lynx-preview'

type DomPapiOptions = {
  root?: HTMLElement                                    // defaults to document.body
  onPublishEvent?: (name: string, handler: string) => void  // defaults to one console warning
}
createDomPapi(options?: DomPapiOptions): LynxElementApi   // the engine, for setEngine()
installLynxReset(document: Document): void                // idempotent; createDomPapi calls it
LYNX_ROOT_ATTRIBUTE: 'data-lynx-root'                     // marks the element the reset is scoped to
createVisualViewportEmitter(): KeyboardEmitter            // for trackKeyboard({ emitter })
```

`LynxElementApi` and `KeyboardEmitter` are `@amritk/mini-lynx`'s own types, from
`@amritk/mini-lynx/engine` and `@amritk/mini-lynx/keyboard`.

## The keyboard, which needs one extra line

Lynx reports the soft keyboard through `keyboardstatuschanged` on the engine's
`GlobalEventEmitter`, and that event is unsupported on the web — so a preview
would otherwise never hear about a keyboard at all and `<KeyboardAvoiding>`
would sit there, correct and motionless. `createVisualViewportEmitter()` reports
it from `visualViewport` instead:

```ts
import { trackKeyboard } from '@amritk/mini-lynx/keyboard'
trackKeyboard({ emitter: createVisualViewportEmitter() })   // on a device: trackKeyboard()
```

## Rendering into the page from outside the runtime

`Portal` takes a container you own. Anything you create for it has to carry
`LYNX_ROOT_ATTRIBUTE`, or the preview's scoped layout reset does not apply to it
and the subtree lays out like HTML rather than like Lynx:

```ts
const layer = document.createElement('view')
layer.setAttribute(LYNX_ROOT_ATTRIBUTE, '')
```

## Gotchas

- **A green preview is not a green device.** Four things this target is
  structurally blind to: a missing `__FlushElementTree` (the DOM is eager, so an
  uncommitted mutation still appears), anything element-creation-specific (on a
  device `__CreateElement('view')` builds a node that is not really a view; in a
  browser every tag is a custom element), layout (linear is approximated with
  flex, and `linear-weight` and the `relative-*` family have no CSS equivalent),
  and propagation for non-touch events (Lynx's response chain is a single node
  for anything that is not a touch, so `scroll` does not bubble there and does
  here).
- **String event handlers cannot be delivered.** They name a handler in the
  *background* JavaScript context, which a browser does not have. They are
  reported through `onPublishEvent` — one console warning per handler name by
  default — rather than silently dropped. Worklet handlers, which is what this
  runtime registers, run normally.
- **Elements keep their Lynx names.** `__CreateElement('view')` produces
  `<view>`, not a `<div>`, so the browser inspector shows the tree the Lynx
  devtool would. The browser therefore knows nothing about any of these tags,
  which is what `installLynxReset` is for — it is scoped to the page element, so
  the rest of the host page keeps its ordinary web defaults.
- **`installLynxReset` is already called for you** by `createDomPapi`, once per
  document. Call it directly only when you render Lynx tags into a document the
  PAPI does not own.
- **This is not a web *target*.** Lynx ships a real one — `@lynx-js/web-platform`
  — and a production web build should use that. This is a small honest subset,
  sized for a dev loop and for tests.
- **`NativeModules` is a different boundary.** This package is the engine only.
  The background context, where `NativeModules` and `GlobalEventEmitter` live,
  is `@amritk/mini-lynx-native` and the fakes each `@amritk/lynx-*` package
  publishes from its own `/testing` subpath.

## Where it is used

`create-mini-lynx` scaffolds an app whose `bun run dev` boots on this, and
`apps/playground-mini-lynx` in this repo is the same wiring at kitchen-sink
scale.
