---
'@amritk/mini-lynx': major
---

Rewrite `@amritk/mini-lynx` as a signals runtime **for Lynx**, driving Lynx's Element PAPI directly, and delete the multi-platform layer it used to be.

The package used to own a five-tag platform-neutral vocabulary, a `Host` contract of about fifteen functions, and three implementations of it, so that a component could be written once and run on a device and in a browser. **Lynx already does that** — iOS, Android, Harmony and the web are its problem, one layer down, and it solves them with an engine rather than with a mapping table. The abstraction was paying for cross-platform twice and getting the worse of the two deals: a vocabulary that could express a fraction of what the engine could, and a preview target allowed to disagree with the device.

What was load-bearing survives unchanged: real elements created once and mutated forever by signals, with no virtual tree. That is worth more on Lynx than on the web, because the element tree lives on the main thread and every property write is a real mutation.

**Gone:** `Host` and `setHost`, the DOM, memory and Lynx hosts, `elements.ts`, `/ui`, `/platform`, `/gestures`, `/animate`, `VirtualFor`, `/router/browser`, and every attribute and event mapping table.

**New:** `setEngine`/`globalEngine` over `LynxElementApi`; `renderPage` for the entry contract the engine expects; JSX typings for all 34 Lynx tags derived from `@lynx-js/types` (a types-only optional peer, so the vocabulary tracks the engine version an app pins rather than this package's releases); `@amritk/mini-lynx/testing`, a complete in-memory Element PAPI the whole suite runs against; and `<list>`, `<textarea>`, `<svg>`, real CSS, event capture and interception, and everything else the old vocabulary could not name.

Three findings shaped the implementation, all of them silent failures on a device and none visible from a browser:

- **An event listener cannot be a closure.** `__AddEvent` takes a handler name or a worklet handle; a function is stored and then never invoked on the fiber architecture. The runtime registers a token and installs the `runWorklet` global the engine calls, which keeps it compilerless. That token round-trip is verified against the fake engine but **not yet on a physical device** — prototype it before shipping.
- **`__CreateElement('view', …)` does not create a view.** Per-tag creators are mandatory for the tags that have one; the generic creator silently produces an element that does less.
- **`parentComponentUniqueId: 0` is out of range**, and silently disables class, id and tag selector resolution — the tree renders and every stylesheet rule misses.

The reasoning, the trade-offs and what this closes off are in `docs/mini-lynx-runtime.md`.

Merged with `main`'s router work rather than replacing it: the navigation stack (`RouteStack`, `StackTransition`) is ported to the engine, `createRouter` keeps the batched `depth` signal and the announce-once guard a stack depends on, and `matchRoute`, `parseQuery` and `schemaToValidator` now come from `@amritk/mini-helpers` rather than from copies in this package.
