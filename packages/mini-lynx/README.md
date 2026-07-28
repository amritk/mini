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
rather than what this package has named. `<list>` recycling, waterfall, sticky
headers, `@keyframes`, CSS selectors and variables, grid, event interception,
the devtool understanding the tree — all of it works without a release here.

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
| `/testing` | `createFakeEngine`, `serializeTree` |

## Known gaps

The ceiling is the engine's rather than this package's, so most of what an app
might want is a matter of writing the tag. These are the places where that is
not true — where the runtime itself is what is missing.

**`<list>` does not recycle yet.** The engine's `__CreateList` does not take an
id like the other creators; it takes the recycling callbacks
(`componentAtIndex`, `enqueueComponent`) the framework is expected to implement,
and the engine drives cell reuse by calling back into them. Until those exist a
`<list>` is built through `__CreateElement`, which means every row is realised up
front. Every other list feature — waterfall, sticky, snap, `full-span`, the gap
properties — works today, because those belong to the engine's layout pass. Only
virtualisation is missing, and for the collection sizes most screens have that is
the same thing; for the ten thousand rows `<list>` exists for, it is not. This is
the largest single piece of work outstanding, and a real one: a recycler's "the
engine owns the cell, you fill it" is a different contract from the rest of this
runtime.

**No `SelectorQuery`, and so no UI methods.** A handful of capabilities are
reached by invoking a method on an element rather than by setting an attribute —
`scrollTo` on a scroller, `setTextSelection` and `getTextBoundingRect` on text,
`setFoldExpanded` on a `scroll-coordinator`. All of them go through
`SelectorQuery`, which is not on the engine boundary. An app can reach for it
itself; nothing here wraps it.

**No gesture composition.** Lynx's composable recognisers — the thing ReactLynx
surfaces as gesture detectors — are not exposed. Ordinary events cover most of
it: `bindtap`, the touch stream, `catch` interception and the exposure
attributes all work, and the touch stream is enough to recognise a gesture by
hand. What is missing is declaring one recogniser as related to another, which
is what the engine's system is actually for.

**Nothing about the background thread.** This runtime is main-thread, so
`NativeModules`, `GlobalEventEmitter` events (the real `exposure`/`disexposure`,
as distinct from the element-level `uiappear`) and the dual-thread bridge are the
app's to reach for. `/query` is the sharp edge here: it wants `fetch` and timers,
and whether those exist in the main-thread context is an engine-version question
rather than a given. An app that cannot reach them should own its fetching on the
background thread and push results in.

**Reduced motion is a regression, and the one worth fixing.** The deleted
`/animate` read the preference and skipped a non-essential timeline on its own,
so honouring it cost an app nothing. Nothing in the runtime can read it now — it
lives on `SystemInfo` or arrives through `globalProps`, both of which are the
app's to consult — so it became the app's call to pass no `transition` to a
`RouteStack` and to leave the animation class off. That is worse ergonomics for
an accessibility feature, which is exactly the kind of thing that quietly stops
being done. If one accessor earns its way back into this package, it is this one.

Deliberately absent, and not on this list: component lifecycle, datasets,
template parts, stylesheet adoption and lazy-bundle queries. None has a caller
here, and an unused function on the engine boundary is a porting cost paid for
nothing.

## Before you ship

Events are bound as **worklet handles**, because Lynx does not usefully accept a
raw closure — it stores one and then never invokes it, silently, on a device
only. This package hands the engine a token of its own making and installs the
`runWorklet` global that resolves it, which is what keeps it compilerless. The
engine-side mechanism is read from the engine's source, but a framework-defined
token has not been round-tripped on a physical device by this package.
**Prototype events on a device before committing to it.** The fallback, if a
particular engine build disagrees, is contained and already understood.

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
