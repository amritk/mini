# @amritk/mini-native — notes for AI coding agents

A signals runtime for **Lynx**: real elements built once, mutated forever by
signals, no virtual tree. This file is the fast path for an LLM; the full
reference is [README.md](./README.md).

> Pre-alpha: APIs change in **minor** versions. There is **no virtual DOM, no
> diffing, no re-render, no hooks**. A component function runs once and returns
> the Lynx element it built.

## The three rules that trip up every agent

**1. Reactivity is decided by value shape at runtime**, because there is no
compiler analysing your code:

```tsx
<view show={visible}>                    {/* ✅ reactive — tracks forever      */}
<view show={visible()}>                  {/* ❌ STATIC — frozen at creation!   */}
<text>{() => `hi ${name()}`}</text>      {/* ✅ reactive derived text          */}
<text>{name()}</text>                    {/* ❌ static text, frozen            */}
<view bindtap={() => n(n() + 1)}>        {/* ✅ calls are fine inside handlers */}
```

A function child inside a `<text>` gets its own `raw-text` element, so it
rewrites only itself and never clobbers static siblings.

Nothing at runtime can catch rule 1 — the call already happened at the JSX call
site, so the runtime sees an ordinary value and so does the type checker. The
source is the only place left, and `@amritk/mini`'s scanner is purely syntactic,
so it catches the identical mistake here: add `catchCalledSignals()` from
`@amritk/mini/vite` to a Vite build, or call `findCalledSignalBindings` from a
CLI gate for a device build (Lynx builds with rspack, not Vite). This package
deliberately ships no second copy.

**2. The tags are Lynx's, not HTML's and not this package's.**
`JSX.IntrinsicElements` is the engine's own vocabulary — `view`, `text`,
`raw-text`, `image`, `list`, `list-item`, `scroll-view`, `textarea`, `svg`,
`overlay`, `refresh`, `viewpager`, `webview` and twenty more — typed from
`@lynx-js/types`. Attributes are spelled the way the engine spells them
(`text-maxline`, `scroll-orientation`, `mode`) and events the way a Lynx
template writes them (`bindtap`, `catchtap`, `capture-bindtap`,
`global-bindtap`). There is **no translation table**: if the Lynx docs name an
attribute, write it exactly. There is no `<div>` and no `role=` prop, and there
never were on this design — earlier versions of this package had a five-tag
platform-neutral vocabulary and it is gone.

`className` is not accepted: it is ReactLynx's compile-time alias and there is
no compiler here. Write `class`.

**3. Only `<text>` may hold a text run.** `<view>hello</view>` does not compile.
A run of text in Lynx is a `raw-text` **element**, not a property, and it may
only live inside a `<text>` — so containers take element children only, and on a
device a loose string in a container is a screen that silently comes up blank.
Inside a `<text>` a bare string or a getter is fine and the runtime builds the
`raw-text` for you.

## Setup — the entry point is `renderPage`

A Lynx bundle has a main-thread chunk, and the engine's whole contract with it
is a global `renderPage(data)` that the engine calls once at startup.
`renderPage` from this package installs that global for you, mounts your root
when it fires, and emits the `firstScreen` lifecycle event the platform waits
for — miss that and the app renders but the splash screen never dismisses.

```tsx
// main-thread.tsx — the entry your bundler marks as the main-thread chunk
import { renderPage, signal } from '@amritk/mini-native'

const Counter = () => {
  const count = signal(0)            // read: count() · write: count(next)
  return (
    <view bindtap={() => count(count() + 1)}>
      <text>{() => `tapped ${count()} times`}</text>
    </view>
  )
}

renderPage(Counter)
```

Under it, two lower-level pieces you will see in tests and in embedded cases:

```tsx
import { globalEngine, mount, pageElement, setEngine } from '@amritk/mini-native'

setEngine(globalEngine())                       // once, before anything renders
const dispose = mount(pageElement(), Counter)   // dispose() tears the tree down
```

`globalEngine()` collects the PAPI functions Lynx injects as bare globals.
`requireEngine()` throws if `setEngine` was never called — that is a boot-order
mistake, not a recoverable condition. In tests, `clearEngine()` between cases.

JSX config in the consuming package (this is **not** the React runtime):

```jsonc
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@amritk/mini-native" } }
```

## Handlers run on the main thread

Driving the Element PAPI is what puts this runtime there, so a `bindtap` handler
runs in the same frame as the gesture, and a signal write reaches the tree with
no thread hop. `main-thread:bindtap` is accepted as a spelling and means the
same thing, so a component pasted out of a ReactLynx codebase keeps working.

Two things follow that an app has to know:

- **Heavy work in a handler blocks rendering.** There is no background thread
  absorbing it. Put anything expensive behind an async boundary.
- **The main-thread context is not the background one.** Do not assume the full
  set of platform globals; check what your engine version injects. `/query`
  wants `fetch` and timers, and an app that cannot reach them from the main
  thread should own its fetching on the background thread and push results into
  signals.

> **One caveat worth knowing before you ship.** Lynx will not call a raw closure
> you hand `__AddEvent` — it accepts a handler *name* (routed to the background
> thread) or a worklet handle (dispatched on the main thread), and a function is
> stored and then silently never invoked. This package registers worklet handles
> with a token of its own making, which is what lets it stay compilerless. The
> engine-side mechanism is read from the engine's source, but a
> *framework-defined* token has not been round-tripped on a physical device by
> this package. **Prototype events on a device before shipping anything that
> depends on them.** If it fails the fallback is contained — string handlers
> plus `lynxCoreInject.tt.publishEvent`, exactly as ReactLynx does, at the cost
> of a thread hop.

## Element props

Per-tag props are Lynx's own and are typed from `@lynx-js/types` — read the Lynx
element docs for them. On top of every tag this runtime adds exactly three:

- **`ref`** — called with the element once it is fully built.
- **`show`** — hides in place, through the inline `display` channel. To add and
  remove elements structurally, use the control-flow components.
- **`style` / `class`**, widened. `class` takes a string, an array
  (`['card', active && 'on']`) or a toggle map (`{ card: true, on: active() }`).
  `style` takes a CSS-text string or a bag whose keys may be camelCase or
  kebab-case — `fontSize` and `font-size` are the same property, and the runtime
  converts before the engine sees it.

Style numbers are density-independent pixels — `{ width: 100 }` is 100px, and
the runtime adds the unit. Properties CSS treats as unitless stay unitless.
Because Lynx has real CSS, a **class is the cheap channel** and an inline style
is the dynamic one, exactly as on the web.

`false`, `null` and `undefined` all clear an attribute rather than writing the
string. `id` goes through the PAPI's own `__SetID`, because it is what an id
selector and a `SelectorQuery` match on.

## Building UI

- **`renderPage(Component)`** — the app entry. **`mount(container, Component)`**
  is what it calls, and the right thing for a test or an embedded card: it opens
  the scope that owns every effect and `onCleanup` in the tree.
- **`list(container, items, key, create)`** — keyed collections; `items` is a
  getter, and `container` must be owned solely by the list. Move-minimal: a row
  is only touched when its position genuinely changes, which matters more here
  than on the web because every move is real main-thread work.
- **`<Show>` / `<Switch>`+`<Match>` / `<Dynamic>` / `<For>` / `<Index>`** from
  `@amritk/mini-native/flow` — each owns a `<wrapper>`, Lynx's grouping element
  that takes part in neither layout nor the accessibility tree. Use `For` by
  default and `Index` when values can repeat; `Index` hands each row a *getter*
  for whatever occupies its slot.
- **`<list>` with `<list-item>`** is the engine's own recycling scroller, and
  the right answer for a genuinely long collection — it brings recycling,
  waterfall, sticky headers and snap, none of which this package implements or
  needs to. `item-key` is required on a `list-item` and is the engine's identity,
  a different thing from JSX's `key`.
- **`batch` / `watch` / `untrack`** — group writes, react to changes only, and
  read without subscribing. `watch` skips the initial run unless you pass
  `{ immediate: true }`, which is what makes "navigate when the route changes"
  expressible without firing during setup.
- **`bindText` / `bindProp` / `bindShow` / `bindValue`** — imperative bindings
  for `ref` code. There is no `innerHTML` sink anywhere, by design.

Mutations are committed once per tick: a hundred signal writes cost one
`__FlushElementTree`, and nothing is on screen before that flush.

## Subpath entry points

| Import | Purpose |
|---|---|
| `@amritk/mini-native` | `renderPage`, signals, `mount`, `pageElement`, `list`, binds, `setEngine` / `globalEngine`, the tree ops, JSX types |
| `@amritk/mini-native/engine` | `LynxElementApi` and `LynxElement`, plus `setEngine` / `requireEngine` / `scheduleFlush`. Import this when you are *supplying* an engine rather than rendering into one |
| `@amritk/mini-native/flow` | `Show` / `Switch` / `Match` / `Dynamic` / `For` / `Index` / `defaultKey`. For a long collection reach for the engine's `<list>` instead |
| `@amritk/mini-native/composition` | `createContext` (provide takes a **function**), `Portal`, `ErrorBoundary` |
| `@amritk/mini-native/router` | `createRouter`, `createMemoryHistory`, `RouteView`, `RouteLink`, `matchRoute`, `parseQuery`. Matching is pure arithmetic; history is a seam, and memory is the default because a stack of screens the app holds is genuinely what navigation is here |
| `@amritk/mini-native/forms` | `createForm` / `Field` / `bindField` / `schemaToValidator`. Which binding a field gets is decided by the type of its **initial value**, not by the element |
| `@amritk/mini-native/query` | `createQuery` over `@tanstack/query-core` — the same API as `@amritk/mini`'s. Mind the main-thread note above |
| `@amritk/mini-native/testing` | `createFakeEngine`, `serializeTree` — a complete in-memory PAPI |

There is no `/ui`, no `/platform`, no `/gestures`, no `/animate` and no host
subpath. Components are Lynx elements and CSS; environment questions go to
`SystemInfo` and `globalProps`; gestures and animation belong to the engine
(`@keyframes`, transitions, `element.animate()`).

## Testing with `@amritk/mini-native/testing`

The fake engine is a complete implementation of the same PAPI the device
exposes, so a test against it is a test against the thing that ships — no
device, no emulator, no browser.

```ts
import { clearEngine, mount, setEngine } from '@amritk/mini-native'
import { createFakeEngine, serializeTree } from '@amritk/mini-native/testing'

const engine = createFakeEngine()
setEngine(engine.api)
const dispose = mount(engine.pageElement, Counter)

engine.dispatch(engine.find('view')!, 'tap')
await Promise.resolve()                       // let the scheduled flush run
expect(serializeTree(engine.page)).toMatchInlineSnapshot()

dispose()
clearEngine()
```

- `find(tag)` / `findAll(tag)` / `findByTestId(id)` locate elements;
  `serializeTree(engine.page)` renders the tree as indented text, which diffs
  far better than nested objects.
- `engine.calls()` is every PAPI call in order, and `engine.flushes()` is the
  commit count — use it to assert that a burst of writes coalesced into one.
- `engine.dispatch(el, name, event?, type?)` fires the way the engine does, with
  the **engine's** payload shape (a gesture under `detail`, a scroll as
  `scrollLeft`/`scrollTop`). Nothing normalises it, so what you assert on is
  what a handler really receives.
- It **throws** if anything hands `__AddEvent` a raw function, on purpose: a
  device would accept it and go quiet, and a test should fail loudly instead.
- It records what it was asked to do; it lays nothing out. Asserting an element
  was given `flex-direction: row` is sound. Asserting how wide it ended up is
  not something any test outside a device should do.

Install: `bun add @amritk/mini-native` (or npm/pnpm/yarn). `@lynx-js/types` is
an optional, types-only peer — install it to get the tag typings.
