---
'@amritk/mini-lynx': patch
---

Cut main-thread work out of the paths every screen runs.

This runtime is main-thread because the Element PAPI is, so the work it does
building and updating a tree is not work a background thread can absorb — it is
work the frame has to fit around. Five changes, all in the hot paths, none of
them changing an API:

- `jsx-runtime.ts` walks props with `for…in` instead of `Object.entries`, which
  was allocating an array plus a pair per prop, per element. It was the single
  hottest function in a CPU profile of building a thousand-row list.
- `apply-prop.ts` remembers the event-prefix parse per prop name. Every prop
  used to pay up to six `startsWith` scans on its way to `__SetAttribute`; a
  given spelling is now scanned once for the life of the app.
- `style/to-css-name.ts` and `style/to-style-text.ts` do the same for the CSS
  spelling of a style key and the unitless verdict on it. Both ran a regex per
  key per write, which for a reactive style bag — `style={() => ({ paddingBottom:
  keyboardHeight() })}` — meant rediscovering the same answers every frame.
- `add-event.ts` no longer copies a handler set of one on every delivered event,
  and builds that set empty rather than from an iterable it had to allocate. The
  dispatcher runs on every frame of a scroll, where its garbage competes with
  the layout it is scrolling.
- `resolve-class.ts` collects into one accumulator instead of
  `map`/`filter`/`join`, which allocated three arrays per array level and four
  per toggle map to produce one string. A reactive `class` is the binding an app
  re-runs most.

Measured against an engine that does nothing but keep the tree — so the number
is the runtime's own cost and not a host's — building a thousand rows went from
~9.5ms to ~7ms, about a quarter.

Separately, `testing/create-fake-engine.ts` trims its call log in batches
instead of on every call. It was doing `calls.slice(-1000)` per PAPI call once
past the first thousand, so a suite that builds a thousand rows paid twenty-five
million array writes for a log it keeps a thousand lines of — which also meant
the package's own reconciler benchmark was mostly measuring the fake. `calls()`
slices on the way out, so the window a caller sees is unchanged. End to end that
takes `create 10,000 rows` in `bun run bench:reconciler` from ~840ms to ~170ms,
and `create 1,000 rows` from ~105ms to ~20ms, with the engine-call counts
identical.

The core's gzipped byte budget moves 5449 → 5559 to pay for the lookup tables.
See the note in `core-size-budget.test.ts` for the reasoning; it is the third
deliberate move.
