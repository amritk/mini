# AGENTS.md — @amritk/mini-lynx-preview

Contributor guide for AI agents editing **this package**. Repo-wide rules:
[`../../AGENTS.md`](../../AGENTS.md) and [`../../CLAUDE.md`](../../CLAUDE.md).
Consuming the package instead? See [`AI.md`](./AI.md).

Lynx's Element PAPI, implemented over the DOM, so a `@amritk/mini-lynx` app runs
in a browser tab unmodified. It was `apps/playground-mini-lynx/src/lib/` until
`create-mini-lynx` needed the same engine: a scaffolded app cannot import a
private app's `src/`, and a second copy of a shim this exact is a second thing
to be wrong.

## Commands

```bash
bun run --filter='@amritk/mini-lynx-preview' test
bun run --filter='@amritk/mini-lynx-preview' types:check
bun run --filter='@amritk/mini-lynx-preview' build
```

## Layout

```
src/
  index.ts                  The `.` entry — the four public names and nothing else
  dom-papi.ts               createDomPapi: the whole Element PAPI over the DOM
  install-lynx-reset.ts     The scoped stylesheet that makes browser defaults Lynx defaults
  apply-preview-attribute.ts  One Lynx attribute → the CSS a browser needs for it
  to-lynx-event.ts          A DOM event → the object a Lynx handler is given
  visual-viewport-keyboard.ts  The soft keyboard from `visualViewport`, as a KeyboardEmitter
```

## Invariants — do not break these

- **Types only from `@amritk/mini-lynx`.** Every import of the runtime here is
  `import type`. The reason is not tidiness: a preview that called `setEngine`
  itself would call it on whichever copy of the runtime *this* package resolved,
  which in a consumer's app can be a different copy from the one the app
  imported — and the symptom is a blank screen with no error in it, because the
  app's copy simply never got an engine. The three lines of wiring stay in the
  app. The peer dependency is what keeps the types honest without adding an
  edge.
- **This package is the ENGINE, not a host.** The abstraction it replaced was a
  DOM *host*: a second renderer behind a framework interface both targets
  implemented, which meant every feature was written twice and either side could
  be the odd one out. Implementing the engine's API instead makes the
  relationship asymmetric on purpose — the browser emulates Lynx, so a
  disagreement is the preview's fault. Do not grow a framework-level concept
  here; if something cannot be expressed as one of the PAPI's ~30 functions, it
  does not belong.
- **Elements keep their Lynx tag names.** `__CreateElement('view')` produces
  `<view>`. Mapping to HTML tags would throw away most of the value — the
  browser inspector shows the tree the Lynx devtool would, attribute for
  attribute — and it is the reason a layout reset exists at all.
- **The reset stays scoped to the page element.** It is keyed on
  `LYNX_ROOT_ATTRIBUTE`, installed once per document under a fixed `id`, and
  prepended rather than appended so an app's own stylesheet wins document order.
  A global reset would be this package reaching outside the thing it previews.
- **Say what the preview cannot see, where it happens.** `__FlushElementTree`
  being a no-op, `__CreateElement` losing the per-tag creators' meaning, linear
  layout approximated with flex, and non-touch events bubbling are all *known*
  divergences, each carrying a comment at the line that causes it. A new
  divergence needs the same, and the ones that would mislead a screen belong in
  `AI.md` too.
- **No Node, and no ambient globals beyond the browser's.** `tsconfig.json`
  gives this package `lib.dom` — the only package here that gets it — and
  `types: []`. It has to keep loading under plain Node without throwing, because
  `scripts/dist-smoke.test.ts` imports every built module: touch `document` at
  module scope and that goes red.

## Tests

`src/dom-papi.test.ts` drives the PAPI directly under happy-dom — tree surgery,
attributes, the event bridge, the recycler protocol — with no runtime above it.
The runtime *through* this engine is covered a level up, by
`apps/playground-mini-lynx/src/screens.test.ts`, which mounts every screen on it.
