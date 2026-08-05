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

**Adding an export means adding a line to that package's `AI.md`.**
`bun run check:ai-docs` reads what each package publishes and fails on anything
its `AI.md` never mentions — a new subpath, a new function, a native package
with no *Status* section. It is not a style check: these files are the only
documentation a coding agent consuming the package will ever read, and a wrong
one is worse than a missing one because nothing about it looks stale. An export
no consumer ever writes goes in `INTERNAL_EXPORTS` in `scripts/ai-docs.ts`, with
the reason.

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
only in the former — and four native modules built on it, with Android and iOS
sources of their own:
[`packages/lynx-notifications`](./packages/lynx-notifications) —
`@amritk/lynx-notifications`, local and remote push —
[`packages/lynx-location`](./packages/lynx-location) —
`@amritk/lynx-location`, device location —
[`packages/lynx-dialogs`](./packages/lynx-dialogs) — `@amritk/lynx-dialogs`,
the platform's own date picker, action sheet and alert — and
[`packages/lynx-deep-linking`](./packages/lynx-deep-linking) —
`@amritk/lynx-deep-linking`, deep links in and out. The Kotlin compiles in CI —
`bun run check:android` — and a parity suite pins their method surfaces against
the TypeScript. The Objective-C compiles nowhere automatic: `pod lib lint` on a
macOS runner cost 81 minutes a run and is commented out in
`.github/workflows/ci.yml`, so run it by hand on a Mac when you touch `ios/`.
**None of it has run on a device.** See each package's `AGENTS.md` for what that
does and does not cover.

The four are deliberately alike: each was built from the last one's shape, so a
structural change to one is usually owed to the others. Where one diverges it
says why — `lynx-dialogs` has no events, because a dialog is asked once and
answers once, so it carries none of the `GlobalEventEmitter` fan-out the others
need; `lynx-deep-linking` is the only one whose inbound half starts *outside*
any LynxView, which is why it owns a `ContentProvider` and a `+load` and why its
launch URL is a value rather than an event.

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

`apps/playground-mini-lynx` covers the bridge and the four native modules too,
which a browser has no more of than it has an engine. Its `src/lib/fake-device.ts`
is the answer: it installs both halves of the bridge over the fake contexts the
package publishes, and registers each module's own published fake as the
registry — so the screens drive the shipping facades against the same contract
those packages' suites assert on, and nothing about a module is reimplemented
for the preview.

## Workflow

```bash
bun install                 # install workspace deps
bun run test                # run every package's tests (packages/* only)
bun run check               # biome lint + format check
bun run check:reactivity    # guard the compilerless-JSX called-signal footgun (packages + apps)
bun run check:ai-docs       # every package's AI.md against what that package actually exports
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
