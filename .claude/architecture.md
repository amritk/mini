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
│   └── mini-native/           # @amritk/mini-native — the same runtime through a pluggable Host
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
- **Depends on:** `alien-signals` only, re-exported from `src/signals.ts` so
  nothing else imports it.
- **Build:** `tsgo -p tsconfig.build.json && tsc-alias && strip-comments`, the
  same pipeline as `@amritk/mini`.

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
- **Functional programming:** one exported thing per file, no classes.
- **Type safety:** strict TypeScript throughout (`exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, …), with the platform boundary itself expressed as
  a compiler constraint rather than a convention.
- **No raw-markup sink without an explicit escape.** `mini`'s `bindHtml` is the
  single sanctioned `innerHTML` path and its `sanitize` argument is required at
  every call site; `mini-native` has no equivalent at all.
- **Sources ship.** Both packages publish `src/` alongside `dist/`, so comments
  are part of the product.
