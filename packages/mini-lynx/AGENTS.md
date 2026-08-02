# AGENTS.md — @amritk/mini-lynx

Contributor guide for AI agents editing **this package**. Repo-wide rules:
[`../../AGENTS.md`](../../AGENTS.md) and [`../../CLAUDE.md`](../../CLAUDE.md).
Consuming the package instead? See [`AI.md`](./AI.md).

A signals runtime for **Lynx**, on `@amritk/mini`'s model: real elements created
once, mutated forever by signals, with no virtual tree in between. It drives
Lynx's Element PAPI directly — the tags, attributes and events are the engine's
own, and the JSX typings are derived from `@lynx-js/types` rather than written
here.

The reasoning behind that shape, and what it cost, is
[`docs/mini-lynx-runtime.md`](../../docs/mini-lynx-runtime.md).
Read it before changing anything structural; most of the invariants below are
one paragraph of it each.

## Commands

```bash
bun run --filter='@amritk/mini-lynx' test
bun run --filter='@amritk/mini-lynx' types:check
bun run --filter='@amritk/mini-lynx' build
```

`types:check` is one pass now. It used to be two — a DOM-free core and a DOM
host checked separately — and the DOM host is gone.

## Layout

```
src/
  index.ts                The `.` entry: signals, mount, tree ops, binds, JSX types
  entry.ts                renderPage — the global the engine calls at startup
  jsx-runtime.ts          The compilerless JSX runtime + the JSX type surface
  jsx-dev-runtime.ts      Dev entry point (same implementation)
  tree.ts                 Tree surgery over the PAPI: create, insert, remove, clear
  apply-prop.ts           One JSX prop → engine calls, deciding static-vs-reactive
  append-children.ts      Children, including reactive raw-text runs
  add-event.ts            One dispatcher per (type, name), fanned out to a handler set
  list.ts                 The only reconciler: keyed list over four tree ops
  render-child.ts         Reactive single-slot swap, the base of control flow
  mount.ts                Application root — opens the owning scope. Plus pageElement()
  types.ts                MaybeReactive, ClassValue, StyleValue, the child types
  context-frame.ts        The ambient frame a lazily-built subtree is rebuilt inside
  run-detached.ts         Escape hatch for scope ownership (see the gotcha below)
  untrack.ts              The same suspension, named for the reader's side of it
  watch.ts                Change-only effect with an untracked callback
  signals.ts              alien-signals re-exported (plus batch), so nothing else imports it
  to-getter.ts            Static-or-reactive prop → a getter, so downstream branches once
  to-factory.ts           An element or a builder → a factory control flow can call
  resolve-class.ts        A ClassValue → the single space-joined string __SetClasses wants
  on-cleanup.ts           Teardown registered against the enclosing scope
  warn.ts                 Recoverable-mistake reporting, without assuming a console
  report-error.ts         setErrorHandler + guard — what the engine-facing boundaries catch into
  global-props.ts         The platform's pushed values, as one signal
  engine/
    element-api.ts        LynxElementApi — the whole platform boundary, as a type
    current-engine.ts     setEngine / requireEngine / scheduleFlush / globalEngine
    index.ts              The `/engine` subpath: the boundary on its own
  events/
    worklet-registry.ts   Handle→closure table + the `runWorklet` global the engine calls
    transport.ts          Which listener form `__AddEvent` is given — the one replaceable engine bet
  style/
    apply-style.ts        The style channel, and the visibility that shares it
    to-css-name.ts        A style key → its CSS spelling
    to-style-text.ts      A bare number → dp, and the unitless properties left alone
  vocabulary/
    intrinsic.ts          34 tags, mapped over `@lynx-js/types` rather than transcribed
    mini-props.ts         The three props the runtime adds: ref, show, and our style/class
  testing/
    create-fake-engine.ts The reference engine — a complete in-memory PAPI
    serialize-tree.ts     That tree as indented text, for assertions
  bind/                   bind-text, bind-prop, bind-show, bind-value
  flow/                   Show, Switch/Match, Dynamic, For, Index, defaultKey
  composition/            createContext, Portal, ErrorBoundary
  router/                 A pluggable history, RouteView, RouteLink, RouteStack + its transitions
  forms/                  createForm, Field, bindField, schema validation
  query/                  createQuery over @tanstack/query-core
  elements/               querySelector/querySelectorAll and invoke — the engine's UI methods
  gestures/               setGestureDetector — recogniser composition, the part events cannot express
  keyboard/               The soft keyboard as a signal, and the layouts that move out of its way
  recycle/                recycle — <list>'s cell recycler, the one inverted-ownership path here
  bridge/                 The fallback event transport: string handlers, with the app owning the wire
examples/
  js-framework-benchmark/ The keyed benchmark; `bun run bench:reconciler` times it
```

There is no `hosts/`, no `ui/`, no `platform/`, no `gestures/`, no `animate/`,
no `elements.ts` and no `host.ts`. All of them were deleted rather than moved —
§3 of the design note is the table of what replaced each.

Two things this package no longer owns and re-exports instead:
`matchRoute`/`parseQuery` and `schemaToValidator` live in
[`@amritk/mini-helpers`](../mini-helpers/AGENTS.md), because they turned out
identical in `@amritk/mini` and here and a defect in one was latent in the
other. `/router` and `/forms` re-export them, so a consumer's imports are
unchanged. That package's charter is **no reactivity, no platform**, and its
own suite enforces it — do not reach for it from anywhere that would need
either.

## Invariants — do not break these

- **The runtime is main-thread, because the PAPI is.** This is not a choice
  anyone made; it falls out of driving the Element PAPI directly, and every
  other main-thread consequence follows from it. It is mostly a gift — a handler
  runs in the same frame as the gesture, a signal write reaches the tree with no
  thread hop — but it means **heavy work in a handler blocks rendering**, with
  no background thread to absorb it. It also means the main-thread context is
  not the background context: do not assume the full set of platform globals.
  `scheduleFlush` schedules on the promise job queue rather than through
  `queueMicrotask` for exactly that reason, and anything new that needs a timer
  or `fetch` (`/query` is the sharp case) has to treat their availability as an
  engine-version question rather than a given.
- **An event listener is a worklet handle, never a closure.** `__AddEvent`
  accepts a string (routed to the background thread by handler name) or
  `{ type: 'worklet', value }` (dispatched on the main thread). A raw function is
  accepted at bind time, stored in a field fiber-arch dispatch does not read, and
  then **silently never invoked** — no error, no JavaScript warning, one line in
  native logs. `EventListenerValue` deliberately does not admit a function so the
  mistake cannot compile. `events/worklet-registry.ts` hands out integer tokens
  and installs the `runWorklet` global that resolves them, which is what lets
  this runtime handle main-thread events with no compiler.
  > **Carry this caveat forward.** The engine-side mechanism is read from the
  > engine's source — dispatch fetches `runWorklet` by name and hands it the
  > token untouched — but a *framework-defined* token has not been round-tripped
  > on a physical device by this package. Prototype it on a device before
  > shipping anything that depends on it. The fallback is contained and already
  > understood: register string handlers and own the receiving end by assigning
  > `lynxCoreInject.tt.publishEvent`, as ReactLynx does, at the cost of a thread
  > hop. See §5 of the design note.
- **Per-tag creators are mandatory for the tags that have one.**
  `__CreateElement('view', …)` builds a generic fiber node for every tag but one:
  a `view` made that way is not a view, and loses `is_view()` and the layout-only
  optimisation, a `text` loses measurement, an `image` loses `src` handling, a
  `list` loses virtualisation. Nothing errors; the element simply does less.
  `CREATORS` in `tree.ts` is the table, and `__CreateElement` is correct only for
  tags with no dedicated creator (`input`, `textarea`, `svg`, `webview`, every
  XElement). Note that the engine's own web port calls `__CreateElement` with
  built-in tags and passes, because on the web every tag is a custom element —
  **the web target cannot validate an assumption about the native one.**
- **`parentComponentUniqueId` is the page's real id, never `0`.** Zero reads
  like a "no owning component" sentinel and is not one: engine ids start well
  above it, so an element created with zero drops out of class, id and tag
  selector resolution. The tree renders, inline styles work, and every
  stylesheet rule quietly misses — a whole styling channel disappearing with
  nothing to indicate why. `componentId()` in `tree.ts` resolves the page's id
  once and caches it, and invalidates the cache when the engine is swapped.
- **A style key reaches the engine in its CSS spelling.** `__SetInlineStyles` is
  handed declarations the engine parses as CSS, where `fontSize` has never been a
  property — a camelCase key is dropped in silence. A style bag may be written
  either way in this package, so `to-css-name.ts` converts once, in
  `apply-style.ts`, and nothing else may write the style channel directly.
  `to-style-text.ts` is the other half: a bare number means density-independent
  pixels, and the unitless properties stay unitless.
- **Visibility must survive a style write.** Lynx expresses an element's style
  bag and its visibility through **one** channel, and `__SetInlineStyles`
  replaces that channel wholesale — so a style write on a hidden element un-hides
  it, and whether it happens depends on the order the props were written in,
  which makes it intermittent rather than reproducible. `apply-style.ts`
  remembers the two parts separately and re-asserts `hidden` after every write.
  Showing an element re-applies its own bag rather than writing a default back,
  because Lynx's default display is `linear`, not `flex`, and is configurable
  per-page — any constant picked here would be wrong for somebody, quietly.
- **No reconciler beyond `list`.** JSX builds an element once and signals mutate
  it in place. `list` needs four tree operations — `insert`, `remove`, `clear`,
  `nextSibling` — and is keyed and move-minimal because every move is real work
  on the main thread. If a feature seems to need diffing, it belongs in a
  different framework, not here.
  > `recycle/` is not a second reconciler and must not become one. It owns no
  > order and compares no trees: the ENGINE decides which rows are on screen and
  > asks for them, and filling a pooled cell is a signal write that the cell's
  > existing bindings turn into exactly the attribute writes that changed. The
  > moment something in there starts diffing element trees to reuse a cell, it
  > has reimplemented hydration and the reason this package is small is gone.
- **A recycling list is created by `recycle`, not by `createElement`.**
  `__CreateList` takes the recycling callbacks rather than an id, so a `<list>`
  written as a JSX tag cannot be one — `createElement` has only a tag to work
  with. That is why `recycle()` builds the element itself and applies the rest of
  the attributes through `applyProp`. A plain `<list>` is still built generically
  and still realises every row up front, which is the right shape below a few
  hundred rows.
- **The fake engine is the reference implementation, and it must stay faithful.**
  `testing/create-fake-engine.ts` is what the whole suite runs against, which is
  a stronger position than a test double usually gets: the code under test is the
  code that ships, against the *real* target's API rather than an abstraction
  this package invented. That only holds while the fake reproduces the engine's
  constraints instead of smoothing them over. Two it reproduces on purpose: it
  keeps **one** listener per `(type, name)` pair, and it **throws** on a function
  listener rather than accepting one — a test must fail where a device would go
  quiet. Element ids start at `10` for the same reason. Do not make the fake more
  forgiving to get a test passing; the test is right.
- **Props and events are spelled the way the engine spells them.** There is no
  translation table in this package and there must not be one: an attribute is
  written `text-maxline`, `mode`, `scroll-orientation`, and an event `bindtap` /
  `catchtap` / `capture-bindtap`. That is what makes the engine's documentation
  this runtime's documentation, lets a new engine attribute work with no release
  here, and removes the entire class of bug where a prop is lost in translation.
  The `Event` suffix table in `apply-prop.ts` is irregular (`bindEvent`,
  `catchEvent`, but `capture-bind`) because the engine string-compares those;
  tidying it up produces listeners that never fire.
- **The vocabulary is derived, not transcribed.** `vocabulary/intrinsic.ts` maps
  over `@lynx-js/types`' own `IntrinsicElements`, so two hundred-odd attributes
  track the engine version an app pins rather than this package's release
  schedule. Adding a tag by hand is only correct where the engine builds one the
  types do not declare — `wrapper` is the single case. Where the docs and the
  shipped types disagree, **follow the types**; the list of adjudicated conflicts
  lives at the top of that file so it can be audited in one place. Never offer a
  prop the engine does not read: it is a documented lie that reads as a layout
  bug on a device.
- **The package compiles with no platform library at all.** `tsconfig.json` omits
  `lib.dom` and Node's ambient types, and there is now no exception to it — the
  DOM host that used to be one is gone. That is why `warn.ts` declares the slice
  of `console` it uses rather than importing it. The guarantee is close to
  trivial today, and it is worth keeping stated: Lynx's main-thread context has
  no `document`, no `window` and no `HTMLElement`, and a stray reference should
  fail the check here rather than at runtime on a device.
- **Every mutation schedules a commit, and a tick costs exactly one.** Nothing
  reaches the screen until `__FlushElementTree` runs, so a function that mutates
  without calling `scheduleFlush` produces a change that appears only when
  something else happens to flush — which looks like a race. `mount` is the one
  deliberate exception: it commits synchronously, because the first screen cannot
  wait for the end of the tick.
- **An insert detaches first.** `insert` in `tree.ts` removes the node from its
  current parent before placing it, so inserting a node that already has a parent
  *moves* it. `list` depends on this, and `__InsertElementBefore` does not do it
  for you.
- **No raw-markup sink, ever.** There is no `innerHTML` equivalent anywhere on
  this boundary, so bound data cannot inject elements.
- **Nothing the engine calls may throw back into it.** Four places in this
  package are entered from native or from the job queue rather than from an app's
  own call stack: the `runWorklet` dispatch behind every event and gesture,
  `/recycle`'s `componentAtIndex` and `enqueueComponent`, the scheduled commit,
  and the lifecycle slots in `entry.ts`. An exception leaving any of them unwinds
  somewhere with no defined behaviour — on a device that ranges from the rest of
  a frame's listeners being skipped to the app going down, and on the job queue
  it is an unhandled rejection nothing is listening for. Each one wraps its body
  in `guard(...)` from `report-error.ts`, which reports and carries on;
  `componentAtIndex` additionally answers `-1`, the engine's own "nothing here".
  **Any new engine-called callback owes the same wrapper.** Reporting rather than
  rethrowing is the deliberate part: there is nowhere useful to throw *to*, and
  a swallow would be the silent failure this package works hardest to avoid.
  `ErrorBoundary` is unaffected — it still owns construction, which is the only
  thing that has a build to unwind.
- **The listener form is a seam, not a constant.** `add-event.ts` asks
  `events/transport.ts` what to hand `__AddEvent` rather than deciding.
  That exists because the worklet round-trip is the one engine assumption here
  that hardware could still disprove, and the failure is total and silent — so
  the recovery has to be a startup line rather than a fork. Do not inline the
  worklet handle back into `add-event.ts`, and do not add a second call site for
  `registerWorklet` outside the default transport and `/gestures` (whose
  callbacks the engine will only take as worklets, so they have no fallback).
- **A global the engine calls by name has exactly one owner.** `runWorklet`,
  `renderPage`, `removeComponents` and `updateGlobalProps` are all "the engine
  calls this function", so whoever assigns last wins and everyone else is
  silently gone. This package claims them in one place each — the registry for
  the first, `entry.ts` for the rest — and `updateGlobalProps` is why
  `global-props.ts` exists at all: an app cannot own that slot AND let a
  component react to a change. `runWorklet` is the one that chains to whatever
  was there before, because a page mid-migration may legitimately run two
  frameworks.
- **Anything that builds a subtree LATER must restore the context frame.**
  `renderChild`, `list` and `ErrorBoundary`'s retry capture `currentFrame()` when
  they are called — during the component body, inside whatever provider wraps it
  — and run every later build inside `withFrame`. Without it, a value provided at
  the app root reaches every component except the ones inside a conditional or a
  list, and it fails silently by falling back to a plausible default. Core does
  not know what a frame IS (it is `unknown` there); `/composition` decides the
  shape. Any new lazy-build path owes the same two lines.
- **Staying compilerless is the point, not a convenience.** ReactLynx and Vue
  Lynx both need a `'main thread'` transform to get a handler onto the main
  thread; this package does not, because the worklet token is its own. Nothing
  may become a required build step — an app configures the standard `react-jsx`
  transform at `jsxImportSource` and that is the whole toolchain contract.
- This package **ships its `src/`** too (see `files`), so source comments are
  shipped — keep them accurate.

## The alien-signals scope-ownership gotcha

A scope created inside a running `effect` is **disposed when that effect
re-runs**. This bites exactly three places — `list`, `renderChild` and
`ErrorBoundary` — all of which build long-lived subtrees from inside a tracking
effect.

In a keyed list the symptom is nasty because it looks fine: appending one row
would dispose every row already on screen, leaving the elements in place with
the right text while all of their bindings quietly stopped updating.
`run-detached.ts` is the fix — it builds those subtrees with no reactive owner
installed, handing lifetime back to the code that actually knows when a subtree
should die.

The `list` suite owes a regression test for this — *"keeps existing rows
reactive after another row is appended"* — and it is the one case that fails
loudly if `runDetached` is ever removed as an apparent redundancy.

> `@amritk/mini` had the same latent bug, and a comment in its `render-child.ts`
> asserted the opposite behaviour. Both are fixed there now — it has its own
> `run-detached.ts` — so the two packages agree about how the engine behaves.

## The reserved-`key` gotcha

`key` is reserved by JSX. The transform hoists any `key` attribute out of the
props object into the runtime's third parameter *before the component is ever
called*, so a component with a legitimate prop of that name — `For`, whose `key`
is the row identity function — would never receive it. `jsx` forwards it back
into props for component tags, and `flow/for.test.tsx` pins that. It stays
ignored for element tags, where there is no keying at the JSX level at all; note
that `list-item`'s `item-key` is a different thing entirely, and is the engine's.

> `@amritk/mini` had this hole too — its `for.test.tsx` only ever called
> `For({…})` directly, which is likely why nobody noticed. Fixed there as well.

## Testing

Vitest, per [`../../.claude/testing.md`](../../.claude/testing.md). Every suite
runs against `createFakeEngine()` in the default node environment — there is no
`// @vitest-environment happy-dom` pragma left in the package, and `document`
genuinely does not exist while the tests run.

The pattern is always the same three lines, and `clearEngine()` between cases so
one test does not inherit the previous one's tree:

```ts
const engine = createFakeEngine()
setEngine(engine.api)
mount(engine.pageElement, Component)
```

Assert on `serializeTree(engine.page)` for shape, on `engine.calls()` for what
the runtime asked the engine to do, and on `engine.flushes()` for coalescing.
Fire events with `engine.dispatch(element, 'tap')`, which goes through the real
`runWorklet` indirection rather than reaching for the closure — so the worklet
registry is on the tested path rather than beside it.

What a test here **cannot** tell you is anything about layout or paint. The fake
records what it was asked to do and does not do it; an assertion that an element
was given `flex-direction: row` is sound, and one about how wide it ended up is
not something any test outside a device should be making.

## The relationship with `@amritk/mini`

Siblings, not layers. `mini` renders to the DOM, `mini-lynx` renders to Lynx,
and neither imports the other — same design, re-derived against a different
target, which is also why `mini`'s DOM fast paths (writing `textContent`,
cloning a static template) have no equivalent here.

That independence has a cost: **a defect found in one is usually latent in the
other.** Both gotchas above were found here and then fixed there. When you fix a
bug in this package, go read `../mini/AGENTS.md` and look for the same shape.

The error-reporting seam is the one place that shape does NOT apply, and it is
worth knowing why before porting it across: on the web a throw in a handler
reaches `window.onerror` and a rejected commit reaches `unhandledrejection`, both
of which are defined behaviour with somewhere to report to. Here the frame above
is native and there is no such contract, which is why the guards exist in this
package and not in `mini`.

One thing is deliberately borrowed rather than duplicated: the called-signal
scanner. `@amritk/mini`'s is purely syntactic and does not know which runtime
the JSX belongs to, so it already catches the identical mistake here — which is
why this package ships no second copy, and why `bun run check:reactivity` at the
repo root covers both.

Add a changeset for every change (`bunx changeset`).
