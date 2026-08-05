# @amritk/mini

## 0.7.0

### Minor Changes

- ab6476a: Type route params from the pattern, and give `@amritk/mini-lynx` a browser
  history again.

  **The pattern is now read at the type level.** `PathParams<'/users/:id'>` is
  `{ id: string }`, and `matchRoute` is generic over its pattern, so
  `matchRoute('/users/:id', path)` hands back `{ id: string } | null` instead of a
  record that answers `string` for every key including the misspelt ones. It lives
  in `@amritk/mini-helpers` beside the matcher it mirrors, because the grammar has
  to be one definition or the value and type worlds drift; `path-params.test.ts`
  pins the two together, down to `/v:major` being a literal segment on both sides.

  `PathParams<string>` is `RouteParams`, so this is additive: a table annotated
  `Route[]`, or built at runtime, compiles exactly as before and gets exactly what
  it got before.

  **`buildPath` is the inverse.** `buildPath('/users/:id', { id })` cannot spell
  the pattern wrong, forget a param or be left behind when a route is renamed, and
  its values are encoded to round-trip back through `matchRoute`. A `*` wildcard
  is encoded per segment, because `rest` is a path and its slashes are structure.
  `navigate` still takes a plain string, deliberately — a router navigates to
  concrete paths, and one that matches nothing is what a fallback screen is for —
  so the check sits where the string is assembled instead.

  **`@amritk/mini-lynx/router` gains `route()` and `AnyRoute`.**
  `route('/users/:id', (params) => …, meta)` keeps the pattern's literal type
  alive so the view is handed a `() => { id: string }`. Its three arguments are
  not a style choice: folded into one object literal, the pattern and the metadata
  compete for inference against an intersection, and the metadata loses — a tab
  bar reading `route.label` would get `unknown` back.

  `Route` is now `Route<P extends string = string>`, and the router's generics are
  constrained by the new `AnyRoute`. `Route<'/users/:id'>` is deliberately not
  assignable to `Route<string>` — its `view` demands the narrow getter, and the
  widened form can only promise the flat record — so a table of mixed patterns
  needs a constraint that admits all of them. `render-route.ts` owns the single
  cast that reconciles the two. Existing tables keep working: `Route` with no type
  argument is what it always was.

  **`createBrowserHistory` is back, on `@amritk/mini-lynx/router/browser`.** It is
  a `RouterHistory` and nothing else, because the rest of routing is already
  target-free — a device build swaps `createMemoryHistory()` back in and changes
  nothing else. It takes a `base` prefix, and it stamps its depth into
  `history.state` rather than reading `window.history.length`, which counts the
  whole tab and is wrong in both directions once the user has gone back. That
  stamp is what survives the two things a memory stack never faces: a reload
  mid-stack and a forward button.

  It is the only module in the package that names `window`, and it is quarantined
  accordingly. `src/router/browser/` is excluded from the main compiler pass and
  covered by `tsconfig.dom.json`, so the platform-free rule the rest of the
  package keeps stays something the compiler enforces rather than a convention.
  Hash mode is not included: configuring a host for an SPA fallback is one line,
  where a second URL grammar would be one the device build can never use.

  **`stripBase` moved into `@amritk/mini-helpers`,** since both routers now read a
  browser pathname and a base that meant something slightly different on each side
  is exactly the drift that package exists to prevent. `@amritk/mini`'s router
  surface is unchanged apart from re-exporting `buildPath` and `PathParams`.

### Patch Changes

- 1b6c33d: Bring every package's shipped `AI.md` back in line with what that package
  actually publishes, and add `bun run check:ai-docs` so it cannot drift again.

  The files had gone stale in the way generated-and-committed docs always do —
  silently, and only for the audience that cannot file an issue about it.
  `@amritk/mini` never documented `watch`, `template`, the typed `matchRoute` /
  `buildPath` re-exports on `/router`, `Field` on `/forms`, or the `/vite` subpath
  at all; `@amritk/mini-lynx` was missing `computed` / `effectScope`,
  `fadeTransition`, `keepAboveKeyboard` and `HANDLER_PREFIX`;
  `@amritk/lynx-notifications` documented neither its `/testing` subpath nor the
  fake behind it. All four native packages exported `MODULE` and `EVENTS` with no
  mention of what they are for, and only `@amritk/lynx-dialogs` showed how to wire
  a fake into `installNativeBridge` — which is the one thing a consumer testing
  its own screens needs.

  Two accuracy fixes matter more than the additions. Every native package's
  _Status_ section claimed the Objective-C compiles against the real Lynx pod; the
  macOS CI job was disabled on cost, so it now compiles only when somebody runs
  `pod lib lint` by hand, and the docs say that. And `@amritk/lynx-dialogs` never
  carried a _Status_ section at all, so nothing in it told a reader that none of
  it has run on a device.

  `bun run check:ai-docs` reads each package's `exports` and fails on a runtime
  export, a published subpath, or (for a package shipping native sources) a
  _Status_ section its `AI.md` never mentions. It runs early in CI, before the
  build. Exports no consumer ever writes — the tree operations the JSX transform
  calls, and the like — are listed in `INTERNAL_EXPORTS` with the reason.

- Updated dependencies [ab6476a]
  - @amritk/mini-helpers@0.2.0

## 0.6.0

### Minor Changes

- fd6729c: Add hot reloading, fix the JSX runtime's form-control and binding defects, and
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
  `selected` seeded only a control's _default_ before, so `<input value={draft} />`
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

### Patch Changes

- Updated dependencies [fd6729c]
  - @amritk/mini-helpers@0.1.0

## 0.5.0

### Minor Changes

- 71145da: `list` (and `For`, which wraps it) now reconciles with a move-minimal two-ended
  keyed diff instead of the append-order walk.

  - **Reordering is now O(moves), not O(n).** The previous reconciler was tuned
    for append and replace-the-tail and fell back to an `insertBefore` sweep that
    moved every node after the first mismatch — so a two-row swap or an early-row
    removal touched the whole tail. The new pass closes in from both ends, so
    swapping two rows is two DOM moves, removing an interior row is zero, and a
    reversal is one move per row. Append and replace-the-tail stay a no-move fast
    path, and node identity (focus, scroll, input state) is preserved throughout.
  - **Bulk insertions now batch through a `DocumentFragment`.** A first render,
    a "create many", or an append of many rows touches the live tree once instead
    of once per row; a single-row append (the streaming-transcript hot path) still
    inserts directly, so it does not regress.
  - **A full clear is one DOM operation.** Emptying the list disposes every row
    scope and wipes the container with a single `replaceChildren` instead of
    removing nodes one at a time.
  - **Core `.` size budget raised 2800 → 3050 B gzipped** to fit the reconciler
    work (the bundled core is ~3.0 KB). Subpaths still add zero bytes to `.`, and
    the widget that imports only `.` pays for it once.
  - No API change: same `list(container, items, key, create)` signature, same
    duplicate-key warning, same scope disposal on removal.

- 9a47efa: Flow/router state preservation, correctness fixes across the binding layer, and
  form ergonomics.

  **Fixes**

  - Flow and router components no longer rebuild their subtree when a derived
    condition changes without flipping which branch wins. `renderChild` now gates
    the swap on factory identity, so `<Show when={() => count() > 5}>`,
    `<Switch>`, `<Dynamic>`, and `<RouterView>` keep the mounted node (and its
    focus/scroll/input state) across unrelated signal changes; a same-route param
    change like `/users/1 → /users/2` preserves the view.
  - `watch` runs its callback untracked, so a signal read inside the callback no
    longer becomes a dependency that re-fires the watcher (matches Vue's `watch`).
  - The two-way binds (`bindValue`/`bindSelect`/`bindChecked`) attach their DOM
    listeners inside an effect, so disposing the enclosing `effectScope` detaches
    them too — previously that path stopped only the signal→element effect and
    leaked the element→signal listeners.
  - Number form fields report `NaN` and render blank when cleared instead of
    snapping to `0`, so a `required`/`minimum` check can tell empty from zero.
  - `createQuery` re-seeds the optimistic result when a reactive query key
    changes, so `data`/`isPending` reflect the new key immediately, and `refetch`
    forwards its options to query-core.
  - Hash-mode `navigate` refreshes the route signal even when the target equals
    the current hash (which fires no `hashchange`), and `RouterView` throws a
    clear error when a matched route's view is not a function.
  - `list` warns instead of silently dropping rows when two items share a key.

  **Features**

  - `@amritk/mini/forms` adds a `<Field>` component that renders a label, control,
    and live validation error wired to a `createForm` field in one element;
    `createForm` gains `setError`/`submitError` (with auto-clear on edit and a
    captured `onSubmit` rejection), `reset` now clears submitting/error state, and
    `form.bind` handles `<select>`. The exported field-state type is renamed
    `Field` → `FieldState` to free the name for the component.
  - `<For>` accepts a `fallback` for the empty-list state.
  - `<Link>` gains a reactive `to`, `active`/`activeClass`/`aria-current` for the
    current link, and `target`/`rel`/`title`/`id`/`style` passthrough.
  - The `@amritk/mini/vite` reactivity guard now catches a called signal anywhere
    inside a non-getter attribute or child value — ternaries, logical
    expressions, `style`/`class` object literals, template literals — not only the
    whole-value-is-one-call shape, while still never flagging a call inside a
    getter.

- edaabaa: `<Show>` can pass the narrowed value to a function child. `<Show when={user}>`
  now accepts `{(user) => …}`, where `user` is a getter with `null`/`undefined`
  removed from its type — so the branch reads the value that satisfied `when`
  without repeating the signal or a non-null assertion. The value arrives as a
  getter, so a truthy→truthy change updates it reactively without rebuilding the
  branch (a focused input inside it survives), and the getter returns the last
  truthy value so a read that races the branch's teardown can never throw. The
  existing node and zero-argument factory child forms are unchanged.

### Patch Changes

- c6cd268: Trim allocations on the hottest render paths, with no change in behaviour.

  - **`jsx`** — iterate props with `for…in` instead of `Object.entries(props)`.
    Element creation is the framework's most-executed path, and `Object.entries`
    allocated an array plus a `[key, value]` tuple for every prop on every element
    built; the `for…in` walk allocates nothing. Props always arrive as a plain
    object literal from the JSX transform, so there are no inherited enumerables to
    guard against.
  - **`resolveClass`** — the object (toggle-map) form now accumulates truthy keys
    in a single loop rather than chaining `entries().filter().map().join()`, which
    allocated three throwaway arrays on every reactive `class` update.
  - **`applyStyle`** — the object form iterates with `for…in` for the same reason,
    dropping the per-update tuple array on every reactive `style` update.

  - **`list`** — the keyed reconciler tracked which keys survived a pass with a
    freshly-allocated `Set` (plus an insert per row) on every update. A monotonic
    pass counter stamped onto each cached entry does the same job — survivor
    detection and the duplicate-key warning — without allocating anything per
    update.

  Both the `./jsx-runtime` entry and the size-budgeted core move by a handful of
  gzipped bytes and stay comfortably within budget.

## 0.4.1

### Patch Changes

- d35a9ab: chore: package bump

## 0.4.0

### Minor Changes

- 37b6bd6: Add `@amritk/mini/vite`, a build-time guard for mini's one compilerless-JSX
  footgun: `attr={signal()}` calls the getter and freezes a plain value at
  creation, where `attr={signal}` binds it reactively. The mistake cannot be
  caught at runtime (props are evaluated before `jsx()` runs) or by the type
  checker (a called signal returns a valid static value), so it is caught in the
  source. `catchCalledSignals()` walks the TypeScript AST in Vite's `transform`
  hook, so it reports live in the dev server — a terminal warning per finding
  (clickable `file:line:column`) plus a non-blocking error overlay — and fails
  `vite build`, one plugin covering both the editor feedback loop and the CI gate.
  Pass `{ overlay: false }` to keep dev feedback in the terminal only. To keep
  false positives near zero it only flags a call to a name it can see is a signal
  (`signal()`/`computed()`, or a `Signal<…>`/`ReadonlySignal<…>` type) — so
  `id={makeId()}` is left alone — across both attributes (`disabled={streaming()}`,
  `show`/`class`/`style`, and component props such as `<For each={items()}>`) and
  children (`<span>{count()}</span>`). Bare getters, thunks, and handlers never
  match, and a `// mini-static-ok` comment opts out a deliberate static read. The
  same `findCalledSignalBindings` core backs the repo's `check:reactivity` CLI
  gate. `vite` and `typescript` are optional peer dependencies of this subpath
  only — the `.` core stays dependency-free.

### Patch Changes

- 1901231: Ship AI-agent-facing docs. Each package now includes an `AI.md` in its published
  tarball — a mental model, a minimal runnable example, and the gotchas most
  likely to trip up an LLM — and gains `@example` JSDoc on its primary exports. A
  root `llms.txt` / `llms-full.txt` (generated by `bun run generate-llms`) indexes
  them, and `@amritk/mini` adds a `check:reactivity` guard for the compilerless-JSX
  "called signal" footgun.
- Updated dependencies [1901231]
- Updated dependencies [b4cd20a]
  - @amritk/runtime-validators@0.8.0

## 0.3.0

### Minor Changes

- 1dfbbdf: `<For>` now accepts an `as` prop (with `class`/`style`/`ref`) to render its
  rows into a real element instead of the default `display: contents` host. This
  closes the one place `For` couldn't slot in: a `divide-y`-style list, whose
  `& > :not([hidden]) ~ :not([hidden])` separators only match the container's
  _direct_ children — the `display: contents` wrapper hid the rows one level too
  deep, so the borders landed between hosts, not rows. `<For each={rows} as="ul"
class="divide-y">` makes the rows direct children of a real `<ul>`, so the
  separators fall between them. The host is built through `jsx`, so `class`
  (string / array / toggle-map, static or reactive), `style`, and `ref` behave
  exactly as they do on any JSX element. Omitting `as` keeps the existing
  layout-neutral host — fully backward-compatible.

## 0.2.0

### Minor Changes

- d82bae9: Close a batch of capability gaps found migrating a real admin dashboard onto
  `@amritk/api` and `@amritk/mini`, all backward-compatible.

  **`@amritk/api`**

  - **All-optional query (and cookie) slots are optional at the call site.** When
    every property of a declared `query`/`cookies` schema is optional (no
    `required`), the slot — and, when it is the only declared slot, the whole
    input argument — is now optional in `ClientInput`, folded into `RequiredKeys`
    the same way a fully-absent slot already is. A GET whose query params are all
    optional type-checks as `client.listThings()`. `params` (the path needs them)
    and `body` (declaring it makes a body required) stay strictly required.
  - **Raw `text` / `bytes` request bodies.** `bodyType` gains `'text'` and
    `'bytes'`: the body is validated verbatim against the schema and handed to the
    handler as a `string` (decoded) or a `Uint8Array`, and the typed client sends
    the call's `body` on the wire unchanged under a raw content type you can
    override per call via `headers` — a `text/csv` or binary upload that stays
    inside the typed contract and client. Both engines and the OpenAPI document
    understand it; the 415 check is lenient (`text/*` for text, any media type for
    bytes) so the schema is the gate.
  - **`mounts` handlers receive `env` and `executionContext`.** Prefix-mounted
    sub-handlers (`toFetchHandler` and the compiled engine) are now called with
    the platform arguments as well as the `Request`, so an env-dependent
    sub-router — Better Auth on Cloudflare Workers, where secrets and the DB URL
    live on `env` — can build its instance inside the mount. Existing
    `(request) => Response` mounts keep working.

  **`@amritk/mini`**

  - **`bindSelect(node, model)`** — two-way binding between a `<select>` and a
    string signal, the dropdown analogue of `bindValue`/`bindChecked`: it sets
    `.value` (the property, so the option actually selects) and writes back on
    `change`.
  - **More typed form-control attributes.** `<input>` gains `name`, `checked`,
    `accept`, `min`, `max`, `step`, `multiple`, and `readonly`; `<textarea>` gains
    `name`, `required`, and `readonly` — so file, number, and checkbox inputs stop
    needing `ref` + `setAttribute`.

- 5f0329e: Round out `@amritk/mini` after a deep review, closing gaps without changing the charter:

  - **`mount(container, component)`** — the application root that was missing: it runs a component inside an owning `effectScope`, appends the node, and returns a `dispose` that removes the node and tears the scope down. Top-level `onCleanup` and bindings now have an owner (previously they leaked because a raw `appendChild(App())` opened no scope).
  - **`<For>` is O(n) again** — the core `list` now hands `key`/`create` the running index, so `For` no longer recovers it with an O(n) `each().indexOf(item)` per item (which also mis-keyed duplicate primitives).
  - **SVG works** — the JSX runtime creates SVG tags with `createElementNS`, so `<svg>`/`<path>`/… render instead of becoming inert HTML-namespaced elements. Common SVG element and attribute types are included.
  - **`class` and `style` objects** — `class` accepts a string, an array (falsy entries dropped), or a `{ name: boolean }` toggle map; `style` accepts a cssText string or a property object (camelCase keys kebab-cased). Both stay static-or-reactive. `<select>`/`<option>`/`<form>` attributes are now typed.
  - **`/query` reactive options** — `createQuery` accepts an options getter, so the query key can depend on signals (`() => ({ queryKey: ['user', id()] })`) and refetches when they change. `refetch()` now returns its promise.
  - **Non-string form fields** — `createForm` field values may be `string | number | boolean`; `bind` wires `.checked` for checkbox/radio and a coerced number for number/range inputs, and cleans up its value binding and blur listener with the enclosing scope. New core `bindChecked`. `bindValue` now holds writes during IME composition and commits on `compositionend`.
  - **Router** — `RouteState` gains a parsed `query` record, and a new `<RouterView>` renders the matched route's view and swaps it on navigation (removing the manual cast).
  - **`watch`** — accepts `{ immediate: true }` to also run once on setup.

## 0.1.0

### Minor Changes

- 508aafe: Add `@amritk/mini` — a deliberately tiny signals-based UI layer built on `alien-signals`. Provides fine-grained reactivity (`signal`, `computed`, `effect`, `effectScope`, `batch`, `watch`, `onCleanup`), a capped set of DOM bindings that keep data off the `innerHTML` XSS surface (`bindText`, `bindAttr`, `bindClass`, `bindShow`, `bindValue`, and the single sanctioned `bindHtml` sink), keyed reactive collections (`list`) and static-template cloning (`template`), and a compilerless JSX runtime (`@amritk/mini/jsx-runtime`) whose reactivity is decided by value shape at runtime — a function-valued attribute or child is a live binding, everything else is applied once.
- 79b2383: Grow `@amritk/mini` into a layered framework via tree-shakeable subpath exports, with the `.` entry unchanged (its only runtime dependency stays `alien-signals`) and `"sideEffects": false` set so the bundle-size-sensitive widget pays zero bytes for any of them.

  - **`@amritk/mini/router`** — a client-side router in history or hash modes: `createRouter` (reactive `route` signal + `navigate` + `stop`), `matchRoute` (`/users/:id` patterns with a trailing `*` catch-all), and a `<Link>` that intercepts plain clicks while leaving modified clicks to the browser. Composition is explicit — `<Link>` takes `router.navigate` as a prop, not from a context.
  - **`@amritk/mini/flow`** — ergonomic control-flow components built on core primitives: `<Show>`, `<For>` (keyed, backed by `list`), `<Switch>`/`<Match>`, and `<Dynamic>`.
  - **`@amritk/mini/forms`** — field state (value/dirty/touched/errors as signals), submit handling, and validation that accepts either a `(values) => errors` function or a JSON Schema validated through `@amritk/runtime-validators` (eval-free/CSP-safe); inputs bind through the core `bindValue`.
  - **`@amritk/mini/query`** — a thin adapter bridging `@tanstack/query-core` observers to mini signals (caching/dedup/retry/invalidation from TanStack Query), mirroring how `solid-query` wraps query-core.

  `@amritk/runtime-validators` and `@tanstack/query-core` are optional peer dependencies, needed only by `/forms` schema validation and `/query` respectively. Two enforcement tests ship with the work: a core import-boundary walk (the `.` graph contains only `alien-signals` and no subpath leaks, and each feature stays free of the others) and a gzipped size budget on the bundled `.` entry.
