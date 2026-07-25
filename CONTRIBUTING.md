# Contributing to mini

Thanks for your interest. mini is pre-alpha; the surface area is still moving, so opening an issue first is the fastest path for anything beyond a small fix.

## Getting started

```bash
git clone https://github.com/amritk/mini.git
cd mini
bun install
```

You'll need [Bun](https://bun.sh) ≥ 1.1.

## Common commands

| Command | What it does |
|---|---|
| `bun run test` | Run the full test suite (Vitest) |
| `bun run check` | Lint with biome |
| `bun run format` | Auto-format with biome |
| `bun run check:reactivity` | Catch signals frozen by being called in JSX |
| `bun run types:check` | Type-check both packages |
| `bun run build` | Build both packages |
| `bun run test:dist` | Load, drive and npm-install the built artifacts (needs a prior build) |

Per package: `bun run --filter='@amritk/mini' test` (and `build`, `types:check`).

## Workflow

1. Create a branch off `main`.
2. Make your changes. Add tests for new behaviour.
3. Run `bun run check`, `bun run check:reactivity`, `bun run types:check`, `bun run test`, and `bun run build` locally.
4. Add a changeset describing your change:
   ```bash
   bunx changeset
   ```
   Pick the affected packages and a semver bump. The release workflow turns this into a version PR + npm publish on merge to `main`. For docs/tooling/CI changes that touch no published package, use `bunx changeset --empty`.
5. Open a pull request. CI runs the checks above, and a bot posts the bundle-size delta against your base branch into the PR description.

## Before you propose a feature

**The cap is the design.** No virtual DOM, no diffing, no re-render, and the `.` entry of each package is byte-budgeted — `src/core-size-budget.test.ts` and `src/import-boundary.test.ts` will fail a PR that grows it. A feature only some apps need belongs on a subpath with its own module graph; a feature that needs diffing belongs in a different framework.

Read the package's `AGENTS.md` ([mini](./packages/mini/AGENTS.md), [mini-native](./packages/mini-native/AGENTS.md)) before editing it. Both document invariants — the alien-signals scope-ownership gotcha and the reserved-`key` gotcha in particular — that have regression tests you should not "fix".

The two packages are siblings, not layers: `mini-native` does not import `mini`. A defect found in one is usually latent in the other, so **when you fix a bug in one, check the other for the same shape**.

## Code style

- TypeScript style, formatting, and conventions are enforced by [Biome](./biome.json) — run `bun run format` before pushing.
- Project-specific guidelines live in [`.claude/`](./.claude):
  - `typescript.md` — type-level conventions
  - `bun.md` — Bun-specific APIs
  - `comments.md` — when (and when not) to write comments
  - `testing.md` — how tests are organized
  - `architecture.md` — repo layout and design
- Both packages **ship their `src/`**, so source comments reach consumers. Keep them accurate.

## Reporting issues

Use the [issue tracker](https://github.com/amritk/mini/issues). Please include:

- Which package and version
- A minimal component or snippet that reproduces the problem
- Expected vs. actual rendering or binding behaviour

## Security

See [SECURITY.md](./SECURITY.md) for how to report vulnerabilities.

## License

By contributing you agree your contributions will be licensed under the [MIT License](./LICENSE).
