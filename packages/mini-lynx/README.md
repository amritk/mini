<div align="center">

# @amritk/mini-lynx

**A signals runtime for Lynx. Real elements created once, mutated forever by signals — no virtual tree, no diffing, no re-render.**

![status](https://img.shields.io/badge/status-pre--alpha-ef4444?style=flat-square)&nbsp;
![version](https://img.shields.io/npm/v/@amritk/mini-lynx?style=flat-square&logo=npm&logoColor=white&label=version&color=6366f1)&nbsp;
![license](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)&nbsp;
![size](https://img.shields.io/badge/deps-1%20(alien--signals)-f97316?style=flat-square)&nbsp;
![vibe coded](https://img.shields.io/badge/vibe-coded-a855f7?style=flat-square)

</div>

---

## What it is

`@amritk/mini-lynx` drives [Lynx](https://lynxjs.org)'s Element PAPI directly.
JSX builds a real Lynx element immediately, once; a function-valued prop or
child becomes a live binding; everything else is written once and never looked
at again. A component function runs a single time, and the only reconciler in
the package is `list`.

It is [`@amritk/mini`](../mini)'s design pointed at a different target — same
signals, same compilerless JSX, same build-once-mutate-forever model. It ships
from the [mini](../../README.md) monorepo.

**No VDOM matters more here than it does on the web.** Lynx's element tree lives
on the main thread and every property write is a real mutation with a cost, so a
runtime that writes only what actually changed is not shaving milliseconds off a
diff — it is the difference between one attribute write and a subtree commit.
Driving the PAPI directly is also what puts this runtime on the main thread, so
a handler runs in the same frame as the gesture that triggered it, with no thread
hop. That is what `main-thread:bindtap` buys a ReactLynx app by hand, one handler
at a time, applied to everything by construction.

## What it is not

**It is not a cross-platform layer. Lynx is.** iOS, Android, Harmony and the web
are the engine's problem, one layer down, and it solves them with a real engine
rather than with a mapping table. This package therefore owns no vocabulary of
its own: the tags are the engine's (`view`, `text`, `list`, `scroll-view`,
`textarea`, `svg`, `overlay`, …), the attributes are spelled the way the engine
spells them (`text-maxline`, `scroll-orientation`), the events are Lynx's own
(`bindtap`, `catchtap`, `capture-bindtap`), and the JSX typings are derived from
`@lynx-js/types` — the Lynx team's, tracking the engine version *you* pin rather
than this package's release schedule.

The consequence worth stating plainly: the ceiling is what the engine can do
rather than what this package has named. Waterfall and sticky headers,
`@keyframes`, CSS selectors and variables, grid, event interception, the devtool
understanding the tree — all of it works without a release here.

The exceptions are the handful of places the engine calls the *framework* rather
than the other way round, because there is no attribute to write: cell recycling
(`/recycle`), gesture arbitration (`/gestures`) and UI methods (`/elements`).
Those needed code here, and now have it.

It is also not a component library, a design system, or a styling solution.
Lynx has real CSS; use it.

If you are rendering to the DOM, you want [`@amritk/mini`](../mini) instead.
Neither package wraps the other.

## Install

```bash
npm install @amritk/mini-lynx
# or: pnpm add / yarn add / bun add
```

```jsonc
// tsconfig.json — this is not the React runtime
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@amritk/mini-lynx" } }
```

`@lynx-js/types` is an optional, types-only peer. Install it to get the tag
typings; it ships nothing but `.d.ts`, so it costs your bundle nothing.

## A minimal app

```tsx
// main-thread.tsx — the entry your bundler marks as the main-thread chunk
import { renderPage, signal } from '@amritk/mini-lynx'

const Counter = () => {
  const count = signal(0)
  return (
    <view bindtap={() => count(count() + 1)} class="card">
      <text>{() => `tapped ${count()} times`}</text>
    </view>
  )
}

renderPage(Counter)
```

`renderPage` installs the global the engine calls once at startup, mounts the
root when it fires, and emits the `firstScreen` lifecycle event the platform
waits for.

The reactivity rule is the whole API surface for state: **a function tracks,
anything else is applied once.** Signals are zero-argument functions, so passing
one without calling it is already a live binding — `disabled={busy}` tracks
forever, `disabled={busy()}` is frozen at creation. That last line is the one
real footgun of a compilerless JSX, and `@amritk/mini`'s scanner catches it
(`catchCalledSignals` for a Vite build, `findCalledSignalBindings` for anything
else — Lynx builds with rspack).

## Testing off-device

The platform boundary is one type and a handful of functions, and
`@amritk/mini-lynx/testing` implements all of it in memory. A test against the
fake is a test against the *real* target's API, so there is no second renderer
to keep in step and no preview that can quietly disagree with the device.

```ts
import { mount, setEngine } from '@amritk/mini-lynx'
import { createFakeEngine, serializeTree } from '@amritk/mini-lynx/testing'

const engine = createFakeEngine()
setEngine(engine.api)
mount(engine.pageElement, Counter)

engine.dispatch(engine.find('view')!, 'tap')
expect(serializeTree(engine.page)).toMatchInlineSnapshot()
```

It records what it was asked to do; it does not lay anything out. Layout belongs
to the engine.

## Subpaths

Each is its own module graph, so importing one pulls in none of the others.

| Import | Purpose |
|---|---|
| `@amritk/mini-lynx` | `renderPage`, signals, `mount`, `list`, the tree ops, the binds, JSX types |
| `/engine` | `LynxElementApi`, `LynxElement`, `setEngine` — the platform boundary on its own |
| `/flow` | `Show`, `Switch`/`Match`, `Dynamic`, `For`, `Index` |
| `/composition` | `createContext`, `Portal`, `ErrorBoundary` |
| `/router` | `createRouter`, `createMemoryHistory`, `RouteView`, `RouteLink`, `matchRoute` |
| `/forms` | `createForm`, `Field`, `bindField`, `schemaToValidator` |
| `/query` | `createQuery` over `@tanstack/query-core` |
| `/elements` | `querySelector`, `querySelectorAll`, `invoke` — the engine's UI methods |
| `/gestures` | `setGestureDetector`, `GestureType` — recogniser composition |
| `/recycle` | `recycle` — `<list>`'s cell recycler |
| `/testing` | `createFakeEngine`, `serializeTree` |

## Known gaps

The ceiling is the engine's rather than this package's, so most of what an app
might want is a matter of writing the tag. These are the places where that is
not true — where the runtime itself is what is missing.

**A recycled cell pool is per-shape, not per-row.** `recycle` pools cells by
`reuseIdentifier`, and rows sharing one must be structurally interchangeable
because they will be handed each other's elements. That is the engine's model
rather than a simplification here, but it is worth stating: a `cell` function
that branches into genuinely different trees needs an identifier per branch, or
the pool will hand a header the elements of a row. Give the two different
identifiers and the problem is gone.

**A move inside a recycling list is a remove plus an insert.** The
`update-list-info` diff is keyed by `item-key`, so an unchanged row is left
alone when its neighbours move; a row that genuinely moved is described as two
edits rather than one. The engine re-queries either way and a cell is a pool
entry rather than something with an identity to preserve, so this is correct —
it is simply not minimal, and a list that reorders constantly does more work
than it strictly must.

**Nothing about the background thread.** This runtime is main-thread, so
`NativeModules`, `GlobalEventEmitter` events (the real `exposure`/`disexposure`,
as distinct from the element-level `uiappear`) and the dual-thread bridge are the
app's to reach for. `/query` is the sharp edge here: it wants `fetch` and timers,
and whether those exist in the main-thread context is an engine-version question
rather than a given. An app that cannot reach them should own its fetching on the
background thread and push results in.

**Reduced motion needs one line from the app.** `reducedMotion()` is consulted
by `RouteStack` and is yours to consult anywhere else, but the runtime cannot
read the preference: there is no reduced-motion field on `SystemInfo`, and Lynx
has no media queries, so no `prefers-reduced-motion` either. It reaches your
host app natively and you pass it in with `setReducedMotion`, the same way you
pass colour scheme. Everything downstream of that is free.

Deliberately absent, and not on this list: component lifecycle, datasets,
template parts, stylesheet adoption and lazy-bundle queries. None has a caller
here, and an unused function on the engine boundary is a porting cost paid for
nothing.

## Before you ship

Three things in this package are written against contracts read from the engine's
source and from ReactLynx — the de-facto specification, since nothing upstream is
documented for custom frameworks — rather than verified on hardware. They are the
places where the engine calls *you*, which is exactly where a mistake is silent:
the tree renders, the tests pass, and the device does nothing.

**Prototype all three on a device before committing to this package.**

1. **Events are bound as worklet handles**, because Lynx does not usefully accept
   a raw closure — it stores one and then never invokes it. This package hands
   the engine a token of its own making and installs the `runWorklet` global that
   resolves it, which is what keeps it compilerless. The engine never looks inside
   the token, so a framework-defined one should round-trip; that has not been
   confirmed on hardware. The fallback is contained and already understood:
   register string handlers and own the receiving end by assigning
   `lynxCoreInject.tt.publishEvent`, as ReactLynx does, at the cost of a thread hop.
2. **`/gestures` callbacks go through the same mechanism**, so they carry the same
   caveat and will be resolved by the same prototype. `has-react-gesture` is set
   because the engine gates its arbiter on that attribute name.
3. **`/recycle` implements `componentAtIndex` and `enqueueComponent`.** The
   protocol — the `update-list-info` inventory, and committing each cell with
   `{ triggerLayout, operationID, elementID, listID }` so the engine can correlate
   its request — is mirrored from ReactLynx's implementation and driven in the
   suite through the same `enterListItemAtIndex` / `leaveListItem` pair Lynx's own
   testing-library exposes. What a fake cannot tell you is whether the engine
   agrees about layout, which is the half that only a device can answer.

Full reasoning for every decision above, including what the old cross-platform
design cost and why it was dropped:
[`docs/mini-lynx-runtime.md`](../../docs/mini-lynx-runtime.md).
Agents editing this package start at [`AGENTS.md`](./AGENTS.md); a shorter
consumer-facing brief for an LLM is in [`AI.md`](./AI.md).

> **Pre-alpha.** Breaking changes can land in any 0.x release; they ride a minor
> bump. This package also inherits Lynx's cadence — every JS-side Lynx package
> is still 0.x — and nothing upstream is documented for custom frameworks, so
> ReactLynx is the de-facto specification.

## License

[MIT](../../LICENSE)
