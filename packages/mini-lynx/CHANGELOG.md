# @amritk/mini-lynx

## 0.1.0

### Minor Changes

- fd6729c: First release of `@amritk/mini-lynx`: a signals runtime **for Lynx**, driving
  Lynx's Element PAPI directly, with no virtual tree.

  The package used to own a platform-neutral vocabulary, a `Host` contract and
  three implementations of it, so a component could run on a device and in a
  browser. **Lynx already does that** — iOS, Android, Harmony and the web are its
  problem, one layer down, solved with an engine rather than a mapping table. The
  abstraction paid for cross-platform twice and got the worse of both deals: a
  vocabulary that could express a fraction of what the engine could, and a preview
  target allowed to disagree with the device. What was load-bearing survives: real
  elements created once and mutated forever by signals — worth more on Lynx than
  on the web, because the element tree lives on the main thread and every property
  write is a real mutation.

  **Gone:** `Host`/`setHost`, the DOM, memory and Lynx hosts, `elements.ts`,
  `/platform`, and every attribute and event mapping table.

  **New:** `setEngine`/`globalEngine` over `LynxElementApi`; `renderPage` for the
  entry contract the engine expects; JSX typings for all 34 Lynx tags derived from
  `@lynx-js/types` (a types-only optional peer, so the vocabulary tracks the engine
  version an app pins rather than this package's releases); `@amritk/mini-lynx/testing`,
  a complete in-memory Element PAPI the whole suite runs against; and `<list>`,
  `<textarea>`, `<svg>`, real CSS, event capture and interception, and everything
  else the old vocabulary could not name. `/router` keeps the navigation stack
  (`RouteStack`, `StackTransition`) and `createRouter`'s batched `depth` signal,
  now ported to the engine, with `matchRoute`, `parseQuery` and `schemaToValidator`
  coming from `@amritk/mini-helpers`.

  Three findings shaped the implementation, all silent failures on a device and
  none visible from a browser:

  - **An event listener cannot be a closure.** `__AddEvent` takes a handler name or
    a worklet handle; a function is stored and never invoked on the fiber
    architecture. The runtime registers a token and installs the `runWorklet`
    global the engine calls, which keeps it compilerless. That token round-trip is
    verified against the fake engine but **not yet on a physical device**.
  - **`__CreateElement('view', …)` does not create a view.** Per-tag creators are
    mandatory for the tags that have one.
  - **`parentComponentUniqueId: 0` is out of range**, and silently disables class,
    id and tag selector resolution — the tree renders and every stylesheet rule
    misses.

  The reasoning, the trade-offs and what this closes off are in
  `docs/mini-lynx-runtime.md`; `AI.md` and the README carry the current _Known
  gaps_ (`<list>` does not recycle, no `SelectorQuery` wrapper, gesture composition
  is not exposed, the background thread is the app's, reduced motion is not read
  for you), and CI now regenerates `llms.txt`/`llms-full.txt` and fails on a diff.

### Patch Changes

- Updated dependencies [fd6729c]
  - @amritk/mini-helpers@0.1.0
