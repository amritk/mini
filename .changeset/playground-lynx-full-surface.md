---
---

Fill `@amritk/playground-mini-lynx` out to the whole of the package's public surface — four new screens and two additions to existing ones.

- **`/forms`** — `createForm`, `Field`, `schemaToValidator` (through `@amritk/runtime-validators`, the eval-free interpreter), the binding chosen by a field's initial value type rather than by the element, and `focus`/`blur` alongside the note on why they are calls rather than props.
- **`/data`** — `createQuery` over `@tanstack/query-core`: every state a query can be in, a reactive key, two readers sharing one request, and invalidation left to the client.
- **`/motion`** — `animate` and the rule that makes it composable (the signal is the state; the animation is only how it gets there), `cancel`/`finish` and why `finished` resolves rather than rejecting, an endless timeline, and `reduceMotion` honoured with the `essential` escape hatch.
- **`/lynx`** — the real `createLynxHost` driving a fake Element PAPI inside the browser preview: the element tree a device would show, the PAPI call log as the list reconciler works, engine events arriving normalised to the vocabulary's payloads, flush coalescing, and what the PAPI cannot reach.
- **`/flow`** gains `VirtualFor` over ten thousand rows, reading out how few elements were ever built; **`/platform`** gains `reduceMotion`.

That closes the gap the app existed to close: every public entry point of `@amritk/mini-lynx` now runs in it, which is the bar a new subpath should be held to.

The `/lynx` screen is the one that pays for itself. Because the host takes its PAPI as an argument rather than reading the engine globals, the shipping native target can be driven and inspected from a browser tab — and doing so immediately surfaced two device-only defects, both fixed in the package: inline styles and animation keyframes handed the engine a camelCase key it parses as CSS and drops in silence, and `LynxElementApi` not being exported.

The tab bar became a horizontal `scroll-view` on the way, since eleven evenly flexed tabs give each label about thirty pixels — which is what a native tab bar does when it outgrows the screen, and it comes from the host on both targets.
