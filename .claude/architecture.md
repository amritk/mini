# Architecture

## Overview

`mini` is a **Bun monorepo** holding a deliberately tiny signals UI runtime in
two shapes: `@amritk/mini` renders to the DOM, `@amritk/mini-lynx` renders to
Lynx, through its Element PAPI. Both are compilerless (no build-step transform beyond the
standard `react-jsx` transform pointed at their own runtime) and both are built
on `alien-signals`.

The published packages target browsers and native runtimes; the development
toolchain (install, build, test) uses Bun.

## The idea both packages share

**Real host nodes are created once and mutated forever by signals. There is no
virtual tree in between.**

JSX builds a node. A function-valued attribute or child becomes a live binding;
anything else is applied once and never looked at again. Repetition goes
through `list`, the only reconciler either package has. Nothing diffs, nothing
re-renders, and a component function runs exactly once.

That absence is not a missing feature — it is the whole design, and it is what
makes the native port tractable: the hard part of a React-style framework is
the reconciler, and there is none here to port.

## Repo Structure

```
mini/
├── packages/
│   ├── mini/                  # @amritk/mini — reactive DOM bindings + compilerless JSX
│   ├── mini-lynx/           # @amritk/mini-lynx — the same runtime on Lynx's Element PAPI
│   ├── mini-helpers/          # @amritk/mini-helpers — the pure helpers both of them share
│   ├── mini-lynx-native/      # @amritk/mini-lynx-native — the main-thread ⇄ background wire
│   └── lynx-notifications/     # @amritk/lynx-notifications — the first native module
├── apps/                      # Private kitchen-sink playgrounds, deployed to Cloudflare
│   ├── playground-mini/       # every @amritk/mini entry point, running
│   └── playground-mini-lynx/# every @amritk/mini-lynx entry point, through a DOM Element PAPI
├── .claude/                   # Developer guidelines
├── .changeset/                # Changesets config (release automation)
├── .github/                   # CI, release, bench, issue & PR templates
├── docs/                      # Longer-form design notes and audits
├── scripts/                   # Build, release, bench, dist-smoke and consumer-e2e tooling
└── package.json               # Workspace root (private)
```

## Packages

### `@amritk/mini` (`packages/mini`)

A deliberately tiny, compilerless signals UI layer for the bundle-size-sensitive
embed widget: `alien-signals` for reactivity, a capped set of DOM bindings that
keep data off the `innerHTML` XSS surface
(`bindText`/`bindAttr`/`bindClass`/`bindShow`/`bindValue`, plus the single
sanctioned `bindHtml` sink), keyed collections (`list`), static-template cloning
(`template`), and a compilerless JSX runtime (`@amritk/mini/jsx-runtime`) whose
reactivity is decided by value shape.

- **The `.` entry is byte-budgeted.** Its only runtime dependency is
  `alien-signals`, and it imports **no** subpath module — that constraint is the
  whole design, because the widget bundles it. Two tests enforce it:
  `src/import-boundary.test.ts` walks the `.` source graph (must be
  `alien-signals` only, and each feature must stay free of the others), and
  `src/core-size-budget.test.ts` bundles the `.` entry with an esbuild metafile
  and asserts the gzipped size stays under budget. `"sideEffects": false` keeps
  everything tree-shakeable.
- **Layered subpath exports** grow it into a framework for apps that are not
  bundle-constrained, each its own module graph so importing one pulls in none
  of the others: `@amritk/mini/router` (history/hash client router —
  `createRouter`, `matchRoute`, `<Link>`), `@amritk/mini/flow` (`Show`, `For`,
  `Switch`/`Match`, `Dynamic`), `@amritk/mini/forms` (field state as signals +
  validation via a `(values) => errors` function **or** a JSON Schema through
  `@amritk/runtime-validators`), `@amritk/mini/query` (a thin
  `@tanstack/query-core` → signals adapter), `@amritk/mini/hot` (`hotMount` —
  the entry point's hot-update boundary, so a dev-server edit swaps the tree
  instead of reloading the page), and `@amritk/mini/vite` (the dev-server plugin
  that guards the called-signal footgun and wires up hot updates).
- **Composition is explicit** — no runtime plugin registry / `mini.use()` (it
  would defeat tree-shaking) and no context/provide-inject; dependencies are
  prop-drilled (e.g. `<Link navigate={router.navigate}>`). `ref` is the
  element-extension seam.
- **Depends on:** `alien-signals` (core). `@amritk/runtime-validators` (forms
  schema validation), `@tanstack/query-core` (query) and `vite` (the plugin) are
  **optional peer dependencies** — install them only for the subpath that needs
  them. `@amritk/runtime-validators` is published from the
  [mjst](https://github.com/amritk/mjst) repo and consumed here from npm like
  any other third-party dependency.
- **Build:** browser-only (`lib: DOM`, `types: []`),
  `tsgo -p tsconfig.build.json && tsc-alias && strip-comments`. Tests use Vitest
  + happy-dom.

### `@amritk/mini-lynx` (`packages/mini-lynx`)

The same idea — real nodes created once, mutated forever by signals, no virtual
tree — pointed at **Lynx**, and at nothing else. It drives Lynx's Element PAPI
directly: `JSX.IntrinsicElements` is the engine's own vocabulary (34 tags,
`view`/`text`/`list`/`scroll-view`/`textarea`/`svg`/…), attributes are spelled
the way the engine spells them, and events are `bindtap`/`catchtap`/
`capture-bindtap`. **There is no translation table anywhere in the package.**

That is a reversal of what this package used to be, and the reasoning is in
[`docs/mini-lynx-runtime.md`](../docs/mini-lynx-runtime.md). In
short: it used to own a five-tag platform-neutral vocabulary, a `Host` contract
and three implementations of it, so a component could run on a device and in a
browser. Lynx already solves that one layer down, so the abstraction was paying
for cross-platform twice — and capping what an app could reach at whatever the
vocabulary had named.

- **The platform boundary is the engine's API, not one we invented.**
  `LynxElementApi` is injectable for the same reason `Host` was — so the runtime
  can be driven off-device — but it is the *real* target's API, so a test
  against the fake is a test against what ships. `@amritk/mini-lynx/testing`
  is that fake: a complete in-memory Element PAPI, and what the whole suite runs
  against.
- **The runtime is main-thread, because the PAPI is.** Not a choice; it falls
  out of driving the PAPI directly. A handler runs in the frame of the gesture
  with no thread hop — what `main-thread:bindtap` buys a ReactLynx app one
  handler at a time — at the cost that heavy work in a handler blocks rendering,
  and that the main-thread context is not the background one (`fetch` and timers
  are an engine-version question).
- **An event listener is a worklet handle, never a closure.** `__AddEvent` takes
  a handler name or `{ type: 'worklet', value }`; a raw function is stored and
  then silently never invoked on the fiber architecture. `events/worklet-registry.ts`
  hands out integer tokens and installs the `runWorklet` global the engine calls
  back into, which is what keeps this compilerless where ReactLynx and Vue Lynx
  both need a transform. **That token round-trip is verified against the fake
  engine and not yet on a device** — the caveat is carried in `AGENTS.md`,
  `AI.md` and the design note.
- **The core is platform-free, enforced by the compiler, with no exception left.**
  `tsconfig.json` omits `lib.dom` and Node's ambient types, and now nothing is
  excluded from that: Lynx's main-thread context is not a browser, so a stray
  `document` is a bug on the only target there is. The second `tsconfig.dom.json`
  pass went with the DOM host.
- **Subpaths, each its own module graph:** `/flow` (`Show`, `Switch`/`Match`,
  `Dynamic`, `For`, `Index`), `/composition` (`createContext`, `Portal`,
  `ErrorBoundary`), `/router` (pattern matching, which is pure, plus a pluggable
  `RouterHistory`; `createMemoryHistory` is the only one that ships, because a
  Lynx app has no URL bar), `/forms`, `/query`, `/engine` (the boundary on its
  own) and `/testing`. There is no `/ui`, `/platform`, `/gestures` or `/animate`:
  Lynx has elements, CSS, a gesture system and `@keyframes`.
- **The vocabulary is derived, not written.** `vocabulary/intrinsic.ts` maps over
  `@lynx-js/types` — a **types-only optional peer** — so the tags and attributes
  track the engine version an app pins rather than this package's releases, and
  a new engine attribute needs no release here to become usable.
- **Depends on:** `alien-signals`, re-exported from `src/signals.ts` so nothing
  else imports it, plus `@amritk/mini-helpers` from `/router` and `/forms`.
  `@lynx-js/types` is a types-only optional peer, so it erases at compile time
  and the import-boundary suite asserts it is only ever imported as a type.
- **Build:** `tsgo -p tsconfig.build.json && tsc-alias && strip-comments`, the
  same pipeline as `@amritk/mini`.

### `@amritk/mini-helpers` (`packages/mini-helpers`)

The helpers the other two turned out to need *identically*, factored out so they
cannot drift. It is small on purpose and the bar for adding to it is high: **no
reactivity, no platform.**

- **Two entries.** `.` is `matchRoute`/`RouteParams`/`parseQuery` — pure string
  arithmetic with **zero dependencies**, which is the promise that entry makes.
  `/schema` is `schemaToValidator`/`FormErrors`, on its own entry because it is
  the one thing here that reaches a dependency (`@amritk/runtime-validators`, an
  optional peer, exactly as it was in both `/forms` layers before).
- **Neither published package's surface changed.** Both re-export everything
  from the subpath it already lived on, so `matchRoute` still comes from
  `@amritk/mini/router` and `schemaToValidator` still comes from
  `@amritk/mini-lynx/forms`. The sharing is an implementation detail a
  consumer never has to know about.
- **`src/purity.test.ts` is the charter, enforced.** It walks the graph from
  both entries and asserts `.` has no externals at all, `/schema` has only its
  peer, neither reaches `alien-signals`, and neither imports a sibling package.
  The signals rule is the load-bearing one: a third edge onto the signal engine
  is how a consumer ends up with two reactive graphs that cannot see each
  other's writes — a failure that typechecks, runs, and silently stops updating.
  The platform rule is a compiler constraint (`lib: ["ESNext"]`, `types: []`),
  and it is why `parseQuery` is hand-rolled rather than calling
  `URLSearchParams`, which is a web global and not an ECMAScript one.
- **Depends on:** nothing. `@amritk/runtime-validators` is an optional peer of
  `/schema` alone.
- **Build:** the same `tsgo` + `tsc-alias` + `strip-comments` pipeline. Both
  dependents resolve it through the `development` condition while type-checking
  (`customConditions` in their `tsconfig.json`, dropped again in
  `tsconfig.build.json`) so CI can type-check before it builds; the emit
  resolves it through `types` instead, which is why `bun run --workspaces build`
  builds this package first.

### `@amritk/mini-lynx-native` (`packages/mini-lynx-native`)

The wire between Lynx's two script contexts. Lynx is explicit that **native
modules are background-thread only**, and `@amritk/mini-lynx` renders on the
main thread because the Element PAPI is a main-thread API — so a component
reaching for `NativeModules` gets `undefined`, with no error to read.

This package carries calls one way and `GlobalEventEmitter` events the other:
`callNative` / `callNativeAsync` (the two shapes a Lynx native method comes in),
`isNativeModuleAvailable`, and `onNativeEvent`. The `/background` subpath is the
half an app installs in its background chunk, in one line — the same "the app
owns the wire" bargain `@amritk/mini-lynx/bridge` makes, and for the same
reason: which module runs in the background context is a bundler question this
package cannot answer.

- **The handshake is the load-bearing part.** The two chunks have no defined
  start order and the main-thread one usually wins, so calls queue until the
  background half answers. Without it a call made during a component build is a
  message that goes nowhere and a promise that never settles.
- **No dependencies at all, and no `alien-signals` in particular.** A second
  edge onto the signal engine gives a consumer two reactive graphs that cannot
  see each other's writes — the same rule that keeps `mini-helpers` off it.
- **`/testing`** ships two linked context proxies and a fake emitter, which is
  what the suite runs against.

### `@amritk/lynx-notifications` (`packages/lynx-notifications`)

The first actual native module in the repo, and the reason the bridge exists.
Local and remote push: `UNUserNotificationCenter` + APNs on iOS,
`NotificationManager` + `AlarmManager` + FCM on Android, declared to Lynx's
autolinker through `lynx.lib.json`.

The TypeScript is a thin promise-shaped facade; the substance is the Kotlin and
the Objective-C. `src/testing/create-fake-notifications.ts` is the executable
statement of the contract between them — the suite drives the real facade
against it, which is what pins method names, arities and call forms.

Three checks of decreasing reach, and it is worth knowing which one a green run
came from:

- **`src/native-contract.test.ts`** parses the Kotlin `@LynxMethod` surface and
  the Objective-C `methodLookup` table and asserts both agree with the
  TypeScript — names, arities and event strings. It catches the one failure no
  compiler on either side can see: a rename or an added argument in one language
  only, which compiles everywhere and fails at the bridge on a device. It runs in
  the normal suite, needs no toolchain, and is mutation-checked.
- **`bun run check:android`** compiles the Kotlin against the real
  `org.lynxsdk.lynx:lynx` AAR and packages an AAR, which also merges the
  manifest. Outside `bun run test` because it needs an SDK and minutes; skips
  with an explanation locally, `--require-sdk` in CI. The Gradle harness lives in
  `android-check/` rather than `android/` so the shipped directory stays clean.
- **`pod lib lint`** compiles the Objective-C against the real Lynx pod and iOS
  SDK. macOS only, so CI is the only place it can ever run.

**None of that is a device.** Permission flows, `AlarmManager` under Doze, APNs
registration and FCM delivery are unverified, as is whether Lynx's annotation
processor registers the module without the generated Spec its own template
extends. That caveat is carried in the package's `README.md`, `AI.md` and
`AGENTS.md`, the same way `mini-lynx` carries its worklet round-trip caveat, and
it should be narrowed only by something that actually checked.

## The playgrounds (`apps/`)

Two private, unpublished apps — `@amritk/playground-mini` and
`@amritk/playground-mini-lynx` — that exercise every public entry point of
their package and deploy to Cloudflare Workers as static SPAs (assets-only
Workers with `not_found_handling: "single-page-application"`, so a client router
in `history` mode survives a hard reload).

**They are the only code in the repo written the way a consumer writes it**, and
that is what they are for rather than a side effect. The suites test the
packages from the inside, against source, one primitive at a time; a playground
composes the whole surface into a running app and is therefore where the
composition-level defects show up. Several have, and each is fixed in
`packages/` with a regression test: `renderChild` subscribing the branch swap to
signals a component body read while building; `pan` measuring the end velocity
across the lift rather than across the last movement; a style key reaching the
engine in the camelCase spelling a bag was written with, which it parses as CSS
and drops in silence; a CSS-string `style` being wiped when an element was
hidden and shown again; `applyProp` reading `false` as an absence when on Lynx
it is a stated value, so `flatten={false}` never reached the engine; and Lynx's
own unitless properties (`linear-weight`, the `relative-*` family) picking up a
`px` that made the engine discard them.

The last three are worth dwelling on together, because they share a shape this
repository is otherwise blind to: **each renders correctly in a browser and is
wrong only on a device.** The old arrangement could not see them — a DOM host
translated, a memory host stored things verbatim, and the two agreed with each
other while disagreeing with the only target that mattered. What sees them now
is that there is one target and the tests run against its own API. A target
nobody can look at is a target nobody is checking; a target you have replaced
with an abstraction is worse, because the abstraction looks like it is being
checked.

Two conventions keep them honest, and both are worth preserving:

- **They resolve the packages through the `development` condition**, pinned in
  each app's `vite.config.ts` and `tsconfig.json`, so they build from `src` and
  run in a fresh clone with no prior `bun run build`. Packaging is deliberately
  not their job — `scripts/consumer-e2e.test.ts` packs and installs real
  tarballs for that.
- **The root `build`, `types:check` and `test` include them**, so a breaking
  change to a package fails CI in the playground too. `playground-mini-lynx`
  now carries tests of its own — its DOM Element PAPI has a suite, and
  `src/screens.test.ts` mounts every screen and checks it builds and disposes
  without throwing, which is the cheapest guard against a screen that only fails
  for whoever next opens that tab.

`bun run check:reactivity` scans `apps/` alongside `packages/` for the same
reason — the called-signal footgun is a consumer's mistake to make, so the
consumer-shaped code is where it is most likely to appear.

## How the two relate

They are siblings, not layers: `mini-lynx` does **not** import `mini`. The
division is now the plainest it has ever been — **`mini` renders to the DOM,
`mini-lynx` renders to Lynx**, and neither wraps the other. It used to be
muddier, because `mini-lynx` also had a DOM host and so overlapped with its
sibling on the one target `mini` exists for; that overlap is gone.

Each is allowed the fast paths its target offers and the other cannot copy:
`mini` writes `textContent` directly and clones a static template; `mini-lynx`
uses the engine's per-tag creators and its layout-transparent `wrapper`.

That independence is deliberate and it has a cost: a defect found in one is
usually latent in the other. Both the scope-ownership bug (`run-detached.ts`)
and the reserved-`key` hole were found in `mini-lynx` and then fixed in `mini`
too. **When you fix a bug in one package, check the other for the same shape**
— the per-package `AGENTS.md` files cross-reference each other for exactly this
reason.

## Import Conventions

- **Within a package:** relative `./` imports. Core modules must reference
  siblings by relative path only — a `@amritk/mini/<name>` self-import would
  re-enter the package graph and defeat tree-shaking, and
  `import-boundary.test.ts` fails on it.
- **Cross-package:** the published package name. In practice this only comes up
  in tests and examples, since neither package imports the other.
- **`alien-signals`** is imported by exactly one module per package
  (`src/signals.ts`), which re-exports what the rest of the package may use.

## Testing

- **Framework:** [Vitest](https://vitest.dev). See `.claude/testing.md`.
- **Convention:** test files colocated with implementation, named `*.test.ts` /
  `*.test.tsx`.
- **Environment:** node by default. `@amritk/mini`'s DOM suites opt into
  happy-dom with a `// @vitest-environment happy-dom` pragma;
  `@amritk/mini-lynx` runs everything except `create-dom-host.test.tsx`
  against `createMemoryHost` in plain node, where `document` genuinely does not
  exist — so a stray platform dependency cannot pass unnoticed.
- **Aliases:** `vitest.config.ts` aliases both package names (and their
  `jsx-runtime` subpaths, which the JSX transform emits) back to source, so
  tests run without a build step.
- **Structural tests** are first-class here and should not be treated as
  boilerplate: `import-boundary.test.ts` and `core-size-budget.test.ts` in each
  package are what keep the charter from eroding one convenient import at a
  time.
- **`bun run test:dist`** is the other half, and it needs a prior
  `bun run build`. It loads every compiled module under plain Node, drives the
  built `mini-lynx` runtime through its memory host, and — in
  `consumer-e2e.test.ts` — packs both packages the way `release:publish` does
  (`catalog:`/`workspace:` resolved, the `development` condition stripped),
  installs the tarballs into scratch projects, and imports every declared
  subpath from them. That catches build-, pack- and manifest-level breakage the
  src-aliased suite cannot see by construction.

Run all tests:

```sh
bun run test
```

Run one package's tests:

```sh
bun run --filter='@amritk/mini' test
```

## Design Principles

- **The cap is the design.** No VDOM, no diffing, no re-render. New surface area
  needs a strong justification, and anything only some apps need goes on a
  subpath so the `.` entry stays flat.
- **Reactivity is decided by value shape at runtime.** A function is a binding;
  a value is applied once. The classic bug is calling a signal in JSX
  (`disabled={streaming()}`), which freezes it — `check:reactivity` and the
  shipped Vite plugin both guard it.
- **Compilerless means "no REQUIRED transform", and the ceiling differs per
  package.** Both sit at the standard JSX transform for semantics and an
  optional plugin for diagnostics. `mini` stops there: its consumer bundles into
  somebody else's page against a byte budget, so a required build step is
  friction on the whole point of the package. `mini-lynx` may go one level
  further — an optional *optimising* plugin — because its consumer owns an app
  toolchain, subject to one invariant: **an app that skips the plugin still
  renders correctly**, just slower and larger. Neither may require a transform
  to be correct. The reasoning, including why a cross-platform compiler costs one
  plugin per target toolchain rather than one in total, is in
  [`docs/mini-lynx-cross-platform.md`](../docs/mini-lynx-cross-platform.md) §18.
- **Functional programming:** one exported thing per file, no classes.
- **Type safety:** strict TypeScript throughout (`exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, …), with the platform boundary itself expressed as
  a compiler constraint rather than a convention.
- **No raw-markup sink without an explicit escape.** `mini`'s `bindHtml` is the
  single sanctioned `innerHTML` path and its `sanitize` argument is required at
  every call site; `mini-lynx` has no equivalent at all.
- **Sources ship.** Both packages publish `src/` alongside `dist/`, so comments
  are part of the product.
