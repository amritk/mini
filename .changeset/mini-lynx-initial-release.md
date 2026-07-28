---
'@amritk/mini-lynx': minor
---

Add `@amritk/mini-lynx` — a signals runtime for [Lynx](https://lynxjs.org), driving the engine's Element PAPI directly. JSX builds a real Lynx element once; a function-valued prop or child becomes a live binding; everything else is written once and never looked at again. A component function runs a single time, and the only reconciler in the package is `list`.

**It is not a cross-platform layer. Lynx is.** The package owns no vocabulary of its own: the tags are the engine's, the attributes are spelled the way the engine spells them (`text-maxline`, `scroll-orientation`), the events are Lynx's own (`bindtap`, `catchtap`, `capture-bindtap`), and the JSX typings are derived from `@lynx-js/types` — so they track the engine version *you* pin rather than this package's release schedule. The ceiling is what the engine can do rather than what this package has named.

Driving the PAPI directly is also what puts the runtime on the **main thread**, so a handler runs in the same frame as the gesture that triggered it with no thread hop. That is what `main-thread:bindtap` buys a ReactLynx app by hand, one handler at a time, applied to everything by construction — and it means heavy work in a handler blocks rendering, with no background thread to absorb it.

The entry points:

- **`.`** — signals, `mount`/`renderPage`, tree operations, the binding layer, and the JSX runtime.
- **`/engine`** — `LynxElementApi` and `setEngine`: the whole platform boundary, as a type. Taking the engine as an argument rather than reaching for globals is what makes the runtime testable off-device.
- **`/flow`** — `Show`, `Switch`/`Match`, `Dynamic`, `For`, `Index`.
- **`/composition`** — `createContext`, `Portal`, `ErrorBoundary`.
- **`/router`** — a pluggable history, `RouteView`, `RouteLink`, and `RouteStack` with transitions.
- **`/forms`** — `createForm`, `Field`, `bindField`, JSON Schema validation through an optional peer.
- **`/query`** — `createQuery` over `@tanstack/query-core`.
- **`/elements`** — `querySelector`, `querySelectorAll` and `invoke`, for the capabilities reached by calling a method on an element rather than by setting an attribute.
- **`/gestures`** — `setGestureDetector`, for declaring one recogniser as related to another.
- **`/recycle`** — `recycle`, which drives `<list>`'s cell recycler so a long collection realises a bounded number of elements.
- **`/testing`** — `createFakeEngine` and `serializeTree`: a complete in-memory implementation of the PAPI, which is what the whole suite runs against. It drives a recycler through the same `enterListItemAtIndex` / `leaveListItem` pair Lynx's own testing-library exposes.

`reducedMotion()` and `setReducedMotion()` are on the `.` entry. `RouteStack` consults the preference above the transition seam and skips the animation, so a transition never has to check and an app gets the behaviour by stating the preference once. The runtime cannot read the value itself — there is no reduced-motion field on `SystemInfo`, and Lynx has no media queries — so the host app passes it in the way it passes colour scheme.

Two engine behaviours the runtime handles for you, both of which are silent when got wrong:

- **An event listener is a worklet handle, never a closure.** `__AddEvent` accepts a string (routed to the background thread by name) or `{ type: 'worklet', value }` (dispatched on the main thread). A raw function is accepted at bind time, stored in a field fiber-arch dispatch does not read, and then never invoked — no error, one line in native logs. The package hands the engine a token of its own making and installs the `runWorklet` global that resolves it, which is what keeps it compilerless.
- **Per-tag creators are mandatory.** `__CreateElement('view', …)` builds a generic fiber node that is not a view, losing `is_view()`, text measurement on a `text`, `src` handling on an `image` and virtualisation on a `list`. The runtime uses the dedicated creator for every tag that has one, and passes the page's real `parentComponentUniqueId` rather than `0` — zero is out of range, and an element created with it drops out of class, id and tag selector resolution while inline styles keep working.

> **Pre-alpha.** Breaking changes ride a minor bump. The package also inherits Lynx's cadence — every JS-side Lynx package is still 0.x — and nothing upstream is documented for custom frameworks, so ReactLynx is the de-facto specification. **Prototype events on a device before committing to this**: the worklet mechanism is read from the engine's source, but a framework-defined token has not been round-tripped on physical hardware by this package.
