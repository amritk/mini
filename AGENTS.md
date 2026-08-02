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
- [`packages/mini-lynx`](./packages/mini-lynx) — `@amritk/mini-lynx`, the
  same model rendered through a pluggable `Host`, so it targets a native view
  tree, the DOM, or plain objects.

Two more sit alongside them, for the part of a Lynx app that is not rendering:
[`packages/mini-lynx-native`](./packages/mini-lynx-native) —
`@amritk/mini-lynx-native`, the wire between Lynx's main-thread and background
contexts, because `NativeModules` lives only in the latter and the runtime lives
only in the former — and three native modules built on it, with Android and iOS
sources of their own:
[`packages/lynx-notifications`](./packages/lynx-notifications) —
`@amritk/lynx-notifications`, local and remote push —
[`packages/lynx-location`](./packages/lynx-location) —
`@amritk/lynx-location`, device location — and
[`packages/lynx-dialogs`](./packages/lynx-dialogs) — `@amritk/lynx-dialogs`,
the platform's own date picker and action sheet. Those compile in CI —
`bun run check:android` for the Kotlin, `pod lib lint` on a macOS runner for the
Objective-C — and a parity suite pins their method surfaces against the
TypeScript. **None of it has run on a device.** See each package's `AGENTS.md`
for what that does and does not cover.

The three are deliberately alike: each was built from the last one's shape, so a
structural change to one is usually owed to the others. `lynx-dialogs` is the
one that diverges, and where it does it says why — it has no events, because a
dialog is asked once and answers once, so it carries none of the
`GlobalEventEmitter` fan-out the other two need.

Alongside them, [`packages/mini-helpers`](./packages/mini-helpers) —
`@amritk/mini-helpers`, the handful of helpers that turned out to be *identical*
in both (route matching, query parsing, JSON Schema compilation). It is a leaf:
it imports neither package, and its charter is **no reactivity, no platform**,
enforced by `src/purity.test.ts`. Neither package's public surface changed —
both re-export it from the subpath it already lived on.

Each is independently published and carries its own `AGENTS.md` with the
invariants that package cannot break.

Alongside them sit two private kitchen-sink playgrounds — `apps/playground-mini`
and `apps/playground-mini-lynx` — that exercise every public entry point and
deploy to Cloudflare Workers as static SPAs. They are the only code here written
the way a consumer writes it, which makes them the fastest way to see a change
and the place composition-level defects surface first.

## Workflow

```bash
bun install                 # install workspace deps
bun run test                # run every package's tests (packages/* only)
bun run check               # biome lint + format check
bun run check:reactivity    # guard the compilerless-JSX called-signal footgun (packages + apps)
bun run check:android       # compile the notifications Kotlin (needs ANDROID_HOME; skips without)
bun run types:check         # type-check both packages and both playgrounds
bun run build               # build both packages and both playgrounds
bun run test:dist           # load and drive the built dist/ artifacts (needs a prior build)
bun run bench -- --baseline <dir>   # bundle-size delta against another checkout
```

Per package: `bun run --filter='@amritk/<name>' test` (and `build`, `types:check`).
Per playground: `bun run --filter='@amritk/playground-mini' dev` (and `build`,
`preview`, `deploy`).

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
- **`mini-lynx` may add optional *optimisation*,** because its consumer owns a
  whole app toolchain — under the invariant that **an app skipping the plugin
  still renders correctly**, only slower and larger.

Note what this protects that is easy to miss: the two packages are the same
design re-derived, which is why a defect found in one is worth hunting in the
other. A transform that changes semantics on one side ends that, and the
cross-check is how both shipped gotchas above were found.
[`docs/mini-lynx-cross-platform.md`](./docs/mini-lynx-cross-platform.md) §18
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
