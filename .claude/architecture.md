# Architecture

## Overview

This repository is **`@amritk/niv`** — a deliberately tiny signals UI layer:
reactive DOM bindings plus a compilerless JSX runtime, built on
`alien-signals`. The repo root is the published package; there are no
workspaces. (It was published as `@amritk/mini`; `@amritk/niv` continues from the same version with the same API, which
is why the type names keep their `Mini` prefix and the lint opt-out is still
`// mini-static-ok`.)

The package targets browsers; the development toolchain (install, build, test)
uses Bun.

## The idea

**Real DOM nodes are created once and mutated forever by signals. There is no
virtual tree in between.**

JSX builds a node. A function-valued attribute or child becomes a live binding;
anything else is applied once and never looked at again. Repetition goes
through `list`, the only reconciler the package has. Nothing diffs, nothing
re-renders, and a component function runs exactly once.

That absence is not a missing feature — it is the whole design. The hard part of
a React-style framework is the reconciler, and there is none here to carry, to
ship, or to get wrong. What is left is small enough to bundle into somebody
else's page:

- **The `.` entry is byte-budgeted.** `src/core-size-budget.test.ts` bundles it
  with esbuild, gzips it, and holds two ceilings: one for `.` alone (what a
  `template` + `bind*` consumer ships) and one for `.` + `/jsx-runtime` bundled
  together (what a JSX consumer actually ships, since the transform emits that
  import itself). The budgets are snug on purpose, so a leaked subpath cannot
  hide under the headroom.
- **Subpaths tree-shake independently.** Everything only some apps need —
  routing, control-flow components, forms, queries, hot reload, the Vite
  plugin — lives on its own subpath with its own module graph, so importing one
  pulls in none of the others and the `.` entry pays nothing for any of them.
  `src/import-boundary.test.ts` enforces both halves. `"sideEffects": false`
  keeps all of it tree-shakeable.

## Repo Structure

```
niv/
├── src/                        # The package source; tests colocated (*.test.ts / *.test.tsx)
│   ├── index.ts                # `.` — signals, bind*, list, template, mount, watch, onCleanup
│   ├── jsx-runtime.ts          # `./jsx-runtime` — the compilerless JSX runtime
│   ├── jsx-dev-runtime.ts      # `./jsx-dev-runtime`
│   ├── router/                 # `./router`
│   ├── flow/                   # `./flow`
│   ├── forms/                  # `./forms`
│   ├── query/                  # `./query`
│   ├── hot/                    # `./hot`
│   ├── vite/                   # `./vite`
│   └── internal/               # Leaf helpers shared by subpaths; never reachable from `.`
├── examples/
│   └── js-framework-benchmark/ # A keyed benchmark implementation, tested by the unit suite
├── playground/                 # Kitchen-sink Vite SPA over every entry point (not published)
├── scripts/                    # Build, publish gate, AI-docs, reactivity, bench and dist tests
├── .claude/                    # Developer guidelines
├── .changeset/                 # Changesets config (release automation)
├── .github/                    # CI, release, bench, playground deploy, issue & PR templates
├── AI.md                       # The consumer-facing LLM guide (ships in the tarball)
├── AGENTS.md                   # Contributor invariants
├── README.md                   # The package README
├── CHANGELOG.md
├── LICENSE
├── package.json                # The published manifest
├── tsconfig.json               # src, DOM libs, `types: []`, JSX pointed at the package itself
├── tsconfig.build.json         # rootDir src → outDir dist, tests excluded
├── vitest.config.ts            # Unit suite: aliases the package to src/
└── vitest.dist.config.ts       # Dist suite: no aliases, runs scripts/*.test.ts
```

## The package

### `.` — the core

`alien-signals` for reactivity (`signal`, `computed`, `effect`, `effectScope`,
`batch`), a capped set of DOM bindings that keep data off the `innerHTML` XSS
surface (`bindText`/`bindAttr`/`bindClass`/`bindShow`/`bindValue`/
`bindChecked`/`bindSelect`, plus the single sanctioned `bindHtml` sink), keyed
collections (`list`), static-template cloning (`template`), `mount`, `watch`
and `onCleanup`. Its only runtime dependency is `alien-signals`, and it imports
**no** subpath module.

### `./jsx-runtime` and `./jsx-dev-runtime`

The compilerless JSX runtime: the standard `react-jsx` transform pointed at the
package (`jsxImportSource: "@amritk/niv"`), with reactivity decided by value
shape at runtime. Public JSX types (`MiniChild`, `MiniChildren`,
`MiniElementProps`) keep their old names on purpose.

### The feature subpaths

- **`@amritk/niv/router`** — a history/hash client router: `createRouter`,
  `<Link>`, `<RouterView>`, and the route grammar on its own — `matchRoute`,
  `buildPath`, and the `PathParams`/`RouteParams` types. The grammar lives in
  `src/router/` as `match-route.ts`, `build-path.ts` and `path-params.ts`, with
  `parse-query.ts` and `strip-base.ts` beside them as router internals. These
  are pure string arithmetic with no reactivity, which is why they are tested
  in plain node. The grammar is written three times — once to match, once to
  build, once at the type level — and a change to what a pattern means has to
  land in all three; `path-params.test.ts` and the round-trip case in
  `build-path.test.ts` are what make a disagreement fail instead of typecheck.
- **`@amritk/niv/flow`** — `Show`, `For`, `Switch`/`Match`, `Dynamic`. Each
  reuses a core primitive (`bindShow`, `list`, a scoped `effect`); `Show`,
  `Switch` and `Dynamic` share the single-slot swap in
  `src/internal/render-child.ts`, inside the `display: contents` wrapper from
  `src/internal/create-host.ts`.
- **`@amritk/niv/forms`** — field state as signals (`createForm`, `Field`) and
  validation via a `(values) => errors` function **or** a JSON Schema through
  `schemaToValidator` (`src/forms/schema-to-validator.ts`, which also exports
  `FormErrors`). The schema arm reaches `@amritk/runtime-validators`, an
  optional peer, published from the [mjst](https://github.com/amritk/mjst) repo
  and consumed here from npm like any other third-party dependency.
- **`@amritk/niv/query`** — `createQuery`, a thin `@tanstack/query-core` →
  signals adapter. `@tanstack/query-core` is an optional peer.
- **`@amritk/niv/hot`** — `hotMount`, the entry point's hot-update boundary, so
  a dev-server edit swaps the tree instead of reloading the page. It is a
  subpath rather than a branch in `mount` because the widget ships one static
  bundle and must not pay for a dev-server feature.
- **`@amritk/niv/vite`** — `catchCalledSignals` (guards the called-signal
  footgun live in the dev server and fails `vite build`),
  `findCalledSignalBindings` (the same check as a function), and
  `acceptHotUpdates` (the other half of `/hot`). `vite` and `typescript` are
  optional peers, needed only here.

### Composition and dependencies

- **Composition is explicit** — no runtime plugin registry (it would defeat
  tree-shaking) and no context/provide-inject; dependencies are prop-drilled
  (e.g. `<Link navigate={router.navigate}>`). `ref` is the element-extension
  seam.
- **Depends on:** `alien-signals`, pinned directly at `3.2.1`. Everything else
  is an **optional peer** — `@amritk/runtime-validators` (`/forms` schema arm),
  `@tanstack/query-core` (`/query`), `typescript` and `vite` (`/vite`) —
  installed only for the subpath that needs it.
- **Build:** `tsgo -p tsconfig.build.json && tsc-alias && strip-comments`.
  `tsconfig.json` maps `@amritk/niv`, `@amritk/niv/jsx-runtime` and
  `@amritk/niv/jsx-dev-runtime` to `src/` with an **explicit** `paths` list
  rather than a wildcard, because `tsc-alias` also rewrites matching strings in
  doc comments — a wildcard would turn every `@amritk/niv/router` example into
  `../router`. `prepublishOnly` runs `scripts/check-publishable.mjs`, which
  fails the publish if an `exports` target is missing from `dist/`, if any
  export carries a `development` condition, or if `LICENSE` is absent.
- **Sources ship.** `files` publishes `src/` (minus tests) alongside `dist/`
  and `AI.md`, so comments are part of the product.

## The playground (`playground/`)

A private kitchen-sink Vite SPA that exercises every public entry point — one
page each for signals, JSX, bindings, flow, lists, forms, query and the router —
and deploys to Cloudflare Workers as static assets (an assets-only Worker with
`not_found_handling: "single-page-application"`, so the router in `history`
mode survives a hard reload). The app itself runs on `@amritk/niv/router` and
mounts through `@amritk/niv/hot`.

**It is the only code in the repo written the way a consumer writes it**, and
that is what it is for rather than a side effect. The suites test the package
from the inside, one primitive at a time; the playground composes the whole
surface into a running app and is therefore where composition-level defects
show up first.

- **No manifest of its own.** Its dependencies are root devDependencies, and it
  is driven by root scripts: `bun run playground:dev`, `playground:build`,
  `playground:preview` and `playground:deploy` (`wrangler deploy --config
  playground/wrangler.jsonc`). `.github/workflows/deploy-playground.yml`
  deploys it on push to `main`.
- **It resolves to source.** `playground/vite.config.ts` and
  `playground/tsconfig.json` alias `@amritk/niv` and every subpath straight to
  `../src`, so it runs on a fresh clone without a build. The Vite plugins are
  imported by relative path for the same reason: a config file has to load
  before anything else can. Packaging is not what the playground checks —
  `scripts/consumer-e2e.test.ts` packs and installs a real tarball for that.
- **CI keeps it honest.** `bun run types:check` covers it, CI builds it, and
  `bun run check:reactivity` scans it — the called-signal footgun is a
  consumer's mistake to make, so consumer-shaped code is where it is most
  likely to appear.

## Import Conventions

- **Within `src/`:** relative `./` imports. A `@amritk/niv/<name>` self-import
  would re-enter the package graph and defeat tree-shaking, and
  `import-boundary.test.ts` fails on it.
- **Bare specifiers in shipped sources:** `alien-signals`, plus the optional
  peers, each confined to the subpath that needs it.
- **`src/internal/`** holds leaf helpers several subpaths share. Sharing one is
  fine — it carries no other feature's weight — but `internal/` is never
  reachable from `.`, and a subpath must never reach a sibling *feature*
  directory.
- **Examples and the playground** import the package by its published name
  (`@amritk/niv`, `@amritk/niv/flow`, …), aliased to `src/`, exactly as a
  consumer would write it.

## Testing

- **Framework:** [Vitest](https://vitest.dev). See `.claude/testing.md`.
- **Convention:** test files colocated with implementation, named `*.test.ts` /
  `*.test.tsx`.
- **Environment:** node by default; suites that build DOM opt into happy-dom
  with a `// @vitest-environment happy-dom` pragma on line 1.
- **Aliases:** `vitest.config.ts` aliases `@amritk/niv` and its subpaths (the
  JSX transform emits `@amritk/niv/jsx-runtime`) back to source, so tests run
  without a build step. It includes `src/**/*.test.{ts,tsx}` and the tests under
  `examples/`.
- **Structural tests** are first-class here and should not be treated as
  boilerplate: `import-boundary.test.ts` and `core-size-budget.test.ts` are
  what keep the charter from eroding one convenient import at a time.
- **`bun run test:dist`** is the other half, and it needs a prior
  `bun run build`. `scripts/dist-smoke.test.ts` loads every compiled module
  under plain Node, and `scripts/consumer-e2e.test.ts` runs `npm pack`, installs
  the tarball into scratch consumer projects, and imports every declared
  subpath from them. That catches build-, pack- and manifest-level breakage the
  src-aliased suite cannot see by construction.

Run all tests:

```sh
bun run test
```

## CI and release

- **`ci.yml`** runs, in order: lint (`bun run check`), `check:reactivity`,
  `check:ai-docs`, a regeneration diff of `llms.txt`/`llms-full.txt`, `build`,
  `types:check`, `test`, the playground build, and `test:dist`.
- **`bench.yml`** runs `scripts/bench-compare.ts` against the PR's base branch —
  the gzip bundle size of every published entry — and splices the delta table
  into the PR description (`scripts/splice-bench-delta.cjs`).
- **`release.yml`** runs the changesets action on push to `main`: it opens a
  version PR from merged changesets (`bun run release:version`) and, once that
  merges, publishes with npm trusted publishing over OIDC
  (`bun run release:publish`).
- **`AI.md` is checked, not just written.** `bun run check:ai-docs` fails when a
  published subpath or value export is never mentioned in it, and
  `bun run generate-llms` builds `llms.txt`/`llms-full.txt` from it, which CI
  diffs so the committed copies cannot go stale.

## Design Principles

- **The cap is the design.** No VDOM, no diffing, no re-render. New surface area
  needs a strong justification, and anything only some apps need goes on a
  subpath so the `.` entry stays flat.
- **Reactivity is decided by value shape at runtime.** A function is a binding;
  a value is applied once. The classic bug is calling a signal in JSX
  (`disabled={streaming()}`), which freezes it — `check:reactivity` and the
  shipped Vite plugin both guard it.
- **Compilerless means "no REQUIRED transform", and the ceiling is
  diagnostics.** The package sits at the standard JSX transform for semantics
  and an optional plugin for diagnostics and hot updates, and stops there. Its
  consumer bundles it into somebody else's page against a byte budget, so a
  required build step is friction on the whole point of the package, and a
  transform that rewrote value shapes would turn a one-sentence reactivity rule
  into something only the compiler could predict.
- **Functional programming:** one exported thing per file, no classes.
- **Type safety:** strict TypeScript throughout (`exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, …), with the browser-only boundary expressed as a
  compiler constraint (`types: []`, no Node libs) rather than a convention.
- **No raw-markup sink without an explicit escape.** `bindHtml` is the single
  sanctioned `innerHTML` path and its `sanitize` argument is required at every
  call site.
- **Sources ship.** The package publishes `src/` alongside `dist/`, so comments
  are part of the product.
