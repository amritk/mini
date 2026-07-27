# Architecture

## Overview

`mini` is a **Bun monorepo** holding a deliberately tiny signals UI runtime in
two shapes: `@amritk/mini` renders to the DOM, `@amritk/mini-native` renders to
whatever a pluggable `Host` puts in front of it — a native view tree, the DOM,
or plain objects. Both are compilerless (no build-step transform beyond the
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
│   ├── mini-native/           # @amritk/mini-native — the same runtime through a pluggable Host
│   └── mini-helpers/          # @amritk/mini-helpers — the pure helpers both of them share
├── apps/                      # Private kitchen-sink playgrounds, deployed to Cloudflare
│   ├── playground-mini/       # every @amritk/mini entry point, running
│   └── playground-mini-native/# every @amritk/mini-native entry point, through the DOM host
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
  and asserts the gzipped size stays under budget. It holds a second budget on
  `.` plus `/jsx-runtime` bundled together, because the JSX transform emits that
  import itself — measuring only `.` leaves out roughly a third of what a JSX
  app actually ships. `"sideEffects": false` keeps everything tree-shakeable.
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

### `@amritk/mini-native` (`packages/mini-native`)

The same runtime with the browser taken out of the core: signals, compilerless
JSX, and build-once-mutate-forever nodes, but every platform call goes through a
**`Host`** the caller installs with `setHost`. `JSX.IntrinsicElements` is a
native vocabulary (`view`/`text`/`image`/`scroll-view`/`input`), not
`HTMLElementTagNameMap` — which inverts the usual relationship: the DOM host is
a **preview target for a native app** (`view` → `<div>`, `text` → `<span>`), not
the real target that native approximates.

- **Porting is one file.** The absence of a reconciler is what makes that true —
  there is no virtual tree to diff, so a new target means implementing `Host`
  (about 15 functions) and nothing else. Its one hard requirement: the target's
  node tree must be **mutable**. Three hosts ship: `hosts/memory` (plain
  objects, the reference implementation and what the suite runs against),
  `hosts/dom` (web preview), and `hosts/lynx` (Lynx's Element PAPI, taken as an
  argument so it is testable against a fake engine).
- **The core is platform-free, enforced by the compiler.** `tsconfig.json` omits
  `lib.dom` and Node's ambient types, so a stray `document` anywhere outside
  `hosts/create-dom-host.ts` fails `types:check`; that one file is excluded
  there and checked by `tsconfig.dom.json` instead (the `types:check` script
  runs both passes). Every suite but the DOM host's runs in the node
  environment, where `document` genuinely does not exist.
- **Subpaths, each its own module graph:** `@amritk/mini-native/flow` (`Show`,
  `Switch`/`Match`, `Dynamic`, `For`, `Index`), `@amritk/mini-native/ui` (the
  component layer — `Text`, `Heading`, `Button`, `Link`, `Stack`/`Row`,
  `List`/`ListItem`, `Screen`), `@amritk/mini-native/platform`
  (`platform.os`/`platform.select` plus `colorScheme`/`dimensions`/`safeArea` as
  signals), `@amritk/mini-native/composition` (`createContext`, `Portal`,
  `ErrorBoundary`), `@amritk/mini-native/gestures` (`pan`, `swipe`, arithmetic
  over a pointer stream the host normalises), `@amritk/mini-native/router`
  (pattern matching, which is pure, plus a pluggable `RouterHistory`; the
  browser implementation sits on `/router/browser` so the router itself stays
  platform-free), the three hosts, and `@amritk/mini-native/host` for the
  contract on its own. `/ui` ships semantics and no appearance: it is pure composition over
  the vocabulary's `role` prop, so it needs no host machinery, and screens
  written in it keep the vocabulary confined to a dozen components rather than
  spread across every screen.
- **`Host` carries two optional fields beyond its ~15 functions** — `platform`
  (what the target calls itself) and `environment` (colour scheme, dimensions,
  safe area, each an optional signal). Fields rather than methods on purpose:
  the function count is the porting cost of a new target, and a string that
  never changes should not be spent against it. Prefer the environment to the
  name — a name is a proxy for the thing an app actually cares about, and
  proxies rot.
- **Depends on:** `alien-signals` only, re-exported from `src/signals.ts` so
  nothing else imports it, plus `@amritk/mini-helpers` from `/router` and
  `/forms`.
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
  `@amritk/mini-native/forms`. The sharing is an implementation detail a
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

## The playgrounds (`apps/`)

Two private, unpublished apps — `@amritk/playground-mini` and
`@amritk/playground-mini-native` — that exercise every public entry point of
their package and deploy to Cloudflare Workers as static SPAs (assets-only
Workers with `not_found_handling: "single-page-application"`, so a client router
in `history` mode survives a hard reload).

**They are the only code in the repo written the way a consumer writes it**, and
that is what they are for rather than a side effect. The suites test the
packages from the inside, against source, one primitive at a time; a playground
composes the whole surface into a running app and is therefore where the
composition-level defects show up. Five have, and all five are fixed in
`packages/` with regression tests: `renderChild` subscribing the branch swap to
signals a component body read while building, the DOM host reading `lineHeight`
as CSS's multiplier rather than as dp, `pan` measuring the end velocity across
the lift rather than across the last movement — which meant `swipe` could not
fire in a browser at all — the Lynx host handing the engine the camelCase key a
style bag was written with, which it parses as CSS and drops in silence, and
`/forms`' `Field` arriving from `@amritk/mini` with only the web's `class`
styling channel and none of the portable one.

The fourth is the one worth dwelling on, because it is the shape of defect this
repository is otherwise blind to: the DOM host translated the key, the memory
host stores the bag verbatim, so the browser preview and all 569 tests agreed
with each other and disagreed with the only target that mattered. What caught it
was the `/lynx` playground screen driving the REAL Lynx host against a fake
Element PAPI and printing the tree — which the host's PAPI-as-an-argument design
is what makes possible. A target nobody can look at is a target nobody is
checking.

Two conventions keep them honest, and both are worth preserving:

- **They resolve the packages through the `development` condition**, pinned in
  each app's `vite.config.ts` and `tsconfig.json`, so they build from `src` and
  run in a fresh clone with no prior `bun run build`. Packaging is deliberately
  not their job — `scripts/consumer-e2e.test.ts` packs and installs real
  tarballs for that.
- **The root `build` and `types:check` include them**, so a breaking change to a
  package fails CI in the playground too. `bun run test` does not: they carry no
  tests of their own, which is why the root script filters to `./packages/*`.

`bun run check:reactivity` scans `apps/` alongside `packages/` for the same
reason — the called-signal footgun is a consumer's mistake to make, so the
consumer-shaped code is where it is most likely to appear.

## How the two relate

They are siblings, not layers: `mini-native` does **not** import `mini`. It is
the same design re-derived without a hardcoded platform, so the DOM fast paths
`mini` is allowed to take (writing `textContent` directly, cloning a static
template) have no equivalent there.

That independence is deliberate and it has a cost: a defect found in one is
usually latent in the other. Both the scope-ownership bug (`run-detached.ts`)
and the reserved-`key` hole were found in `mini-native` and then fixed in `mini`
too. **When you fix a bug in one package, check the other for the same shape**
— the per-package `AGENTS.md` files cross-reference each other for exactly this
reason.

`@amritk/mini-helpers` pays that cost down for the narrow band where it can be
paid down for free: code that is already *literally identical* in both and
carries neither reactivity nor a platform. Today that is route matching, query
parsing, and JSON Schema compilation. It does **not** make the two packages
layers — the shared package is a leaf that imports neither of them, and both
depend on it rather than on each other.

Three duplications are deliberate and should stay:

- **The runtime cores** (`signals`, `list`, `mount`, the JSX runtimes, the bind
  helpers) only look parallel. `mini` takes DOM fast paths — `textContent`,
  template cloning — that have no meaning behind a `Host`.
- **`onCleanup` and `runDetached`,** which really are byte-identical, live in
  each `.` entry, whose transitive imports must be `alien-signals` and nothing
  else. Sharing them would put bytes in the widget's bundle to save nine lines.
- **`createQuery`,** also a verbatim port, is built out of signals — and signals
  are the one thing the shared package may never touch.

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
  `@amritk/mini-native` runs everything except `create-dom-host.test.tsx`
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
  built `mini-native` runtime through its memory host, and — in
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
  friction on the whole point of the package. `mini-native` may go one level
  further — an optional *optimising* plugin — because its consumer owns an app
  toolchain, subject to one invariant: **an app that skips the plugin still
  renders correctly**, just slower and larger. Neither may require a transform
  to be correct. The reasoning, including why a cross-platform compiler costs one
  plugin per target toolchain rather than one in total, is in
  [`docs/mini-native-cross-platform.md`](../docs/mini-native-cross-platform.md) §18.
- **Functional programming:** one exported thing per file, no classes.
- **Type safety:** strict TypeScript throughout (`exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, …), with the platform boundary itself expressed as
  a compiler constraint rather than a convention.
- **No raw-markup sink without an explicit escape.** `mini`'s `bindHtml` is the
  single sanctioned `innerHTML` path and its `sanitize` argument is required at
  every call site; `mini-native` has no equivalent at all.
- **Sources ship.** Both packages publish `src/` alongside `dist/`, so comments
  are part of the product.
