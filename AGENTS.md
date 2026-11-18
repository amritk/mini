# AGENTS.md

Guidance for AI coding agents (Cursor, Copilot, Claude Code, …) working **in
this repository**. For Claude Code the same rules live in
[`CLAUDE.md`](./CLAUDE.md); the detailed developer guidelines are in
[`.claude/`](./.claude/) — read the one that matches your task:

- [`.claude/architecture.md`](./.claude/architecture.md) — repo structure and design
- [`.claude/typescript.md`](./.claude/typescript.md) — TypeScript style, principles, naming
- [`.claude/bun.md`](./.claude/bun.md) — Bun runtime, APIs, testing, frontend
- [`.claude/testing.md`](./.claude/testing.md) — test setup, style, examples
- [`.claude/comments.md`](./.claude/comments.md) — comment and JSDoc guidelines

> Consuming the published package rather than editing the repo? The package
> ships an **[`AI.md`](./AI.md)** next to its `README.md` with a mental model, a
> minimal example, and the gotchas most likely to trip up an LLM. Start there.

**Adding an export means adding a line to `AI.md`.** `bun run check:ai-docs`
reads what the package publishes and fails on anything `AI.md` never mentions —
a new subpath, a new function. It is not a style check: that file is the only
documentation a coding agent consuming the package will ever read, and a wrong
one is worse than a missing one because nothing about it looks stale. An export
no consumer ever writes goes in `INTERNAL_EXPORTS` in `scripts/ai-docs.ts`, with
the reason.

## What this is

This repository **is** `@amritk/niv` — the repo root is the published package.
niv is a deliberately tiny signals UI layer: reactive DOM bindings plus a
compilerless JSX runtime, built on `alien-signals`. It used to be published as
`@amritk/mini`; the migration is "replace `@amritk/mini` with `@amritk/niv` in
your imports and nothing else", which is why the public type names keep their
`Mini` prefix (`MiniChild`, `MiniChildren`, `MiniElementProps`) and the
lint opt-out is still `// mini-static-ok`. Do not rename those.

Around the package sit two things that are not published:

- [`playground/`](./playground) — a kitchen-sink Vite SPA that exercises every
  public entry point and deploys to Cloudflare Workers as static assets. It is
  the only code here written the way a consumer writes it, which makes it the
  fastest way to see a change and the place composition-level defects surface
  first. It has no `package.json` of its own; its dependencies are root
  devDependencies, and its `vite.config.ts` and `tsconfig.json` alias
  `@amritk/niv` and every subpath straight to `../src`, so it runs without a
  build.
- [`examples/js-framework-benchmark/`](./examples/js-framework-benchmark) — a
  keyed js-framework-benchmark implementation, covered by the unit suite.

**A new entry point, or a new public export on one, is not finished until the
playground uses it.** Add or extend a page under `playground/src/pages/` and put
it in the route table. This is not a documentation chore: the playground is the
only place in the repository where the package is used the way a consumer uses
it, and the composition-level defects this repo has found were found there
rather than in a suite. An export nobody has composed into an app is an export
nobody has actually tried.

## Workflow

```bash
bun install                 # install deps
bun run test                # the unit suite (src/ and examples/)
bun run check               # biome lint + format check
bun run check:reactivity    # guard the compilerless-JSX called-signal footgun (src, examples, playground)
bun run check:ai-docs       # AI.md against what the package actually exports
bun run types:check         # type-check the package and the playground
bun run build               # build dist/ (tsgo + tsc-alias + strip-comments)
bun run test:dist           # load, drive and npm-install the built dist/ (needs a prior build)
bun run bench -- --baseline <dir>   # bundle-size delta against another checkout
bun run playground:dev      # the playground's Vite dev server (also :build, :preview, :deploy)
```

## Invariants — do not break these

- **The cap is the design.** No virtual DOM, no diffing, no re-render. JSX builds
  real DOM once; dynamic values flow through bind helpers or function-valued
  props; repetition goes through `list`. If a feature seems missing, the answer
  is usually "use Preact/Solid", **not** a new helper. Adding surface area needs
  a strong justification, and a feature only some apps need belongs on a
  subpath, because the `.` entry is byte-budgeted and
  `src/core-size-budget.test.ts` holds the ceiling.
- **Reactivity is decided by value shape at runtime:** a function-valued
  attribute/child/`show` is reactive; anything else is static. The classic bug is
  calling a signal in JSX (`disabled={streaming()}`) — the `@amritk/niv/vite`
  plugin guards it live in the dev server, and `check:reactivity` runs the same
  check in CI. If you add a `.tsx` test that intentionally freezes a signal, mark
  the line `// mini-static-ok`.
- **`bindHtml` is the only `innerHTML` sink**, and its `sanitize` argument is
  required at every call site — never add a default. Everything else writes
  through `textContent` / attributes / `classList`.
- **Subpaths (`router`/`flow`/`forms`/`query`/`hot`) must add zero bytes to the
  `.` entry**, and must stay free of each other — `src/import-boundary.test.ts`
  enforces both. `forms`' schema arm and `query` depend on **optional** peers
  (`@amritk/runtime-validators`, `@tanstack/query-core`) — keep them optional.
  `hot` is why `mount` itself has no hot-reload branch: the widget ships one
  static bundle and must not pay for a dev-server feature.
- **The compiler ceiling is DIAGNOSTICS.** "Compilerless" means no transform is
  ever *required* for correctness: the package sits at the standard JSX
  transform plus an optional plugin. `@amritk/niv/vite` may warn, guard, and wire
  hot updates; it must never be required for correctness and must never rewrite
  semantics. The package's consumer bundles it into somebody else's page against
  a byte budget a test enforces, so a required build step is adoption friction
  on the one thing the package is for. In particular: do not "fix" the
  called-signal footgun by transforming `disabled={streaming()}` into a getter —
  reactivity is decided by value SHAPE at runtime, and a transform that silently
  changes shapes turns a one-sentence rule into something you need the compiler
  to predict.
- **`value`, `checked` and `selected` are PROPERTIES, not attributes**, and they
  are applied after the props loop. The attribute only seeds a control's
  default: it stops reaching the field once the user has typed, and on a
  `<select>` it never selects at all. They are deferred because the `<select>`
  property write only takes once the `<option>`s exist, and `children` is the
  last key the JSX transform emits. Anything else that grows an
  attribute/property split belongs next to them in `isProperty`
  (`src/jsx-runtime.ts`), not inline.
- **`show` and `style` share one inline `display` slot.** Applying a style bag
  replaces the inline style wholesale, so a style write would otherwise un-hide
  what `bindShow` hid — and which won came down to the order the attributes were
  typed in. `applyDisplay` in `src/bind.ts` arbitrates; anything new that writes
  `display` has to go through it.
- **The route grammar is written three times** — `matchRoute`, `buildPath`, and
  the `PathParams` type in `src/router/`. A change to what a pattern means has
  to land in all three or they disagree, and the disagreement typechecks.
  `path-params.test.ts` and the round-trip case in `build-path.test.ts` are what
  make it fail instead.
- The package **ships its `src/`** (see `files` in `package.json`), so source
  comments reach consumers — keep them accurate.

## The alien-signals scope-ownership gotcha

A scope created inside a running `effect` is **disposed when that effect
re-runs**, before the next run's body starts. That is usually what you want, and
it is fatal anywhere a long-lived subtree is built from inside a tracking effect.

`list` is exactly that case. Rows are built inside the reconciliation effect,
which re-runs on every change to the collection, so appending one row used to
dispose the scope of every row already on screen — the nodes stayed in the
document looking perfectly correct while all of their bindings quietly stopped
updating, and each surviving row's `onCleanup` fired as though the row had been
removed. `src/run-detached.ts` is the fix, and because detaching also removes
the chain that used to dispose rows when the component unmounted, `list`
registers its teardown with `onCleanup` to restore it. `src/list.test.ts`
carries a regression test for each half.

`src/internal/render-child.ts` is the opposite case and deliberately relies on
the engine behaviour: its branch scope is meant to be tied to the swap effect,
and the swap effect to the component's scope, which is why `Show` can ignore the
returned teardown without leaking a branch. Do not "fix" it to match `list`.

## The reserved-`key` gotcha

`key` is reserved by JSX. The transform hoists any `key` attribute out of the
props object into the runtime's third parameter *before the component is
called*, so a component with a legitimate prop of that name — `For`, whose `key`
is the row identity function — would never receive it. `jsx` forwards it back
into props for component tags; `src/flow/for.test.tsx` pins that. It stays
ignored for element tags, where there is no keying at the JSX level at all.

## House rules

- **Add a changeset with every PR.** Run `bunx changeset`, pick `@amritk/niv`
  and a semver bump, commit the file under `.changeset/`. For docs/tooling/CI
  changes that do not touch the published package, use `bunx changeset --empty`.
- **Never** put Claude/session links, tracking IDs, or platform attributions in
  commits or PR text — keep them focused on the code.
- Match the surrounding code's style, comment density, and naming. Biome
  (`biome.json`) is the formatter and linter; run `bun run check` before you're
  done.
- **`alien-signals` is the one runtime dependency**, pinned directly in
  `dependencies` (`3.2.1`) — there is no workspace catalog any more. It is the
  reactive core and it is inside the byte-budgeted `.` bundle, so a bump is a
  reviewed change with a changeset, not a drive-by.
- Pre-alpha: breaking changes are allowed but must ride a **minor** version bump
  via a changeset.
