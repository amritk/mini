---
'@amritk/mini': minor
---

Add hot reloading, fix the JSX runtime's form-control and binding defects, and
move the shared routing/schema helpers into `@amritk/mini-helpers`.

**Hot reloading.** `@amritk/mini/hot` (`hotMount`) plus `acceptHotUpdates()` on
`@amritk/mini/vite` turn the dev server's full page reload into a tree swap.
`hotMount` hands the runtime the mount's `dispose` as the module's teardown, so
every effect and `onCleanup` fires before the updated entry mounts the new tree;
`acceptHotUpdates()` appends the literal `import.meta.hot?.accept()` Vite scans
for. The same call site works in a production build, where `import.meta.hot` is
`undefined` and `hotMount` is exactly `mount`. It is a subpath, not an option on
`mount`, so the byte-budgeted `.` entry pays nothing for it.

**Form controls write properties, not attributes.** `value`, `checked` and
`selected` seeded only a control's *default* before, so `<input value={draft} />`
froze after the user's first keystroke and `<select value={picked}>` never
selected anything. They are applied after the props loop, because the `<select>`
property write only takes once its `<option>`s exist. An element with no such
property (`<div value>`) still gets the attribute.

**Binding and JSX fixes**, each found by auditing against `@amritk/mini-lynx`:

- A style write no longer un-hides what `show` hid; the two intents are
  remembered apart, and showing again restores the `display` the element's own
  style asked for.
- Bare numeric style values mean pixels (`style={{ width: 100 }}` produced empty
  CSS), except for the unitless properties and custom `--*` properties.
- `class` flattens nested arrays, drops falsy entries at every level, and
  removes the attribute entirely when it resolves to nothing.
- `ClassValue` accepts falsy values, so `class={cond && 'x'}` type-checks.
- `key` reaches a component again — JSX hoists it out of props, so
  `<For each={rows} key={byId}>` silently fell back to `defaultKey`.
- `bindValue` keeps a write that lands mid-IME-composition instead of losing it.
- A reactive boolean child renders as nothing, matching a static one.
- `<Link active>` sets `aria-current="page"` on its own.

**Lifetime fixes.** `list` built each row's scope inside its reconciliation
effect, so appending one row disposed every rendered row's scope — nodes stayed
on screen while their bindings quietly stopped updating. `renderChild` (behind
`Show`, `Switch`, `Dynamic`, `For`'s fallback and `RouterView`) subscribed the
branch swap to any signal a component body read while building, resetting that
branch's local state on an unrelated write. Both now build through
`runDetached`, and `list`, `renderChild` and `createRouter` register their
teardown with `onCleanup`.

**Tooling.** `catchCalledSignals` scans `.jsx` as well as `.tsx`, and the size
budget now covers `@amritk/mini/jsx-runtime` — roughly 40% of a JSX app's bytes
and previously unmeasured. The `.` entry is unchanged at 3137 bytes gzipped.
