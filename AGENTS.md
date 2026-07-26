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

> Consuming a published package rather than editing the repo? Each package ships
> an **`AI.md`** next to its `README.md` with a mental model, a minimal example,
> and the gotchas most likely to trip up an LLM. Start there.

## What this is

`mini` is a **Bun monorepo** holding a deliberately tiny signals UI runtime in
two shapes:

- [`packages/mini`](./packages/mini) — `@amritk/mini`, reactive DOM bindings
  plus a compilerless JSX runtime.
- [`packages/mini-native`](./packages/mini-native) — `@amritk/mini-native`, the
  same model rendered through a pluggable `Host`, so it targets a native view
  tree, the DOM, or plain objects.

Each is independently published and carries its own `AGENTS.md` with the
invariants that package cannot break.

## Workflow

```bash
bun install                 # install workspace deps
bun run test                # run every package's tests
bun run check               # biome lint + format check
bun run check:reactivity    # guard the compilerless-JSX called-signal footgun
bun run types:check         # type-check all packages
bun run build               # build both packages
bun run test:dist           # load and drive the built dist/ artifacts (needs a prior build)
bun run bench -- --baseline <dir>   # bundle-size delta against another checkout
```

Per package: `bun run --filter='@amritk/<name>' test` (and `build`, `types:check`).

## The one rule both packages share

**The cap is the design.** No virtual DOM, no diffing, no re-render. JSX builds
real host nodes once; dynamic values flow through bind helpers or
function-valued props; repetition goes through `list`. If a feature seems
missing, the answer is usually "reach for a bigger framework", **not** a new
helper — and a feature only some apps need belongs on a subpath, because the
`.` entry is byte-budgeted and `src/core-size-budget.test.ts` holds the ceiling.

Everything more specific lives in the per-package `AGENTS.md`. Read it before
editing that package — the scope-ownership and reserved-`key` gotchas in
particular have both bitten before and both have regression tests you should
not "fix".

## The other rule: no required build step, and the ceiling differs

"Compilerless" means no transform is ever *required* for correctness. Both
packages sit at the standard JSX transform plus an optional plugin for
diagnostics (`@amritk/mini/vite`). Above that they diverge deliberately:

- **`mini` stops at diagnostics.** Its consumer bundles into somebody else's
  page against a byte budget a test enforces, so a required build step is
  friction on the one thing the package is for.
- **`mini-native` may add optional *optimisation*,** because its consumer owns a
  whole app toolchain — under the invariant that **an app skipping the plugin
  still renders correctly**, only slower and larger.

Note what this protects that is easy to miss: the two packages are the same
design re-derived, which is why a defect found in one is worth hunting in the
other. A transform that changes semantics on one side ends that, and the
cross-check is how both shipped gotchas above were found.
[`docs/mini-native-cross-platform.md`](./docs/mini-native-cross-platform.md) §18
has the full accounting.

## House rules

- **Add a changeset with every PR.** Run `bunx changeset`, pick the affected
  packages and a semver bump, commit the file under `.changeset/`. For
  docs/tooling/CI changes that touch no published package, use
  `bunx changeset --empty`.
- **Never** put Claude/session links, tracking IDs, or platform attributions in
  commits or PR text — keep them focused on the code.
- Match the surrounding code's style, comment density, and naming. Biome
  (`biome.json`) is the formatter and linter; run `bun run check` before you're
  done.
- Both packages **ship their `src/`**, so source comments reach consumers — keep
  them accurate.
- **Shared runtime dependencies go through the root `catalog`.** Both packages
  declare `alien-signals` as `"catalog:"`; change the version once, in the root
  `package.json`, never in a package manifest. `catalog:`/`workspace:` are
  resolved at publish time by `scripts/resolve-workspace-protocol.ts` because
  npm understands neither — see `.claude/bun.md`.
- Pre-alpha: breaking changes are allowed but must ride a **minor** version bump
  via a changeset.
