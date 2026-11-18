# Contributing to niv

Thanks for your interest. niv is pre-alpha; the surface area is still moving, so opening an issue first is the fastest path for anything beyond a small fix.

## Getting started

```bash
git clone https://github.com/amritk/niv.git
cd niv
bun install
```

You'll need [Bun](https://bun.sh) ≥ 1.1.

## Common commands

| Command | What it does |
|---|---|
| `bun run test` | Run the unit suite (Vitest) over `src/` and `examples/` |
| `bun run check` | Lint with biome |
| `bun run format` | Auto-format with biome |
| `bun run check:reactivity` | Catch signals frozen by being called in JSX |
| `bun run check:ai-docs` | Check `AI.md` against what the package publishes |
| `bun run types:check` | Type-check the package and the playground |
| `bun run build` | Build `dist/` |
| `bun run test:dist` | Load, drive and npm-install the built artifacts (needs a prior build) |
| `bun run playground:dev` | Run the kitchen-sink playground in Vite |

The playground under [`playground/`](./playground/README.md) has no suite of
its own; `bun run types:check` and `bun run playground:build` (both in CI) are
what keep it honest. It resolves `@amritk/niv` straight to `src/`, so
`bun run playground:dev` works on a fresh clone with no build first.

## Workflow

1. Create a branch off `main`.
2. Make your changes. Add tests for new behaviour.
3. Run `bun run check`, `bun run check:reactivity`, `bun run types:check`, `bun run test`, and `bun run build` locally.
4. Add a changeset describing your change:
   ```bash
   bunx changeset
   ```
   Pick `@amritk/niv` and a semver bump. The release workflow turns this into a version PR + npm publish on merge to `main`. For docs/tooling/CI changes that do not touch the published package, use `bunx changeset --empty`.
5. Open a pull request. CI runs the checks above, and a bot posts the bundle-size delta against your base branch into the PR description.

## Before you propose a feature

**The cap is the design.** No virtual DOM, no diffing, no re-render, and the `.` entry is byte-budgeted — `src/core-size-budget.test.ts` and `src/import-boundary.test.ts` will fail a PR that grows it. A feature only some apps need belongs on a subpath with its own module graph; a feature that needs diffing belongs in a different framework.

Read [`AGENTS.md`](./AGENTS.md) before editing `src/`. It documents invariants — the alien-signals scope-ownership gotcha and the reserved-`key` gotcha in particular — that have regression tests you should not "fix".

## Code style

- TypeScript style, formatting, and conventions are enforced by [Biome](./biome.json) — run `bun run format` before pushing.
- Project-specific guidelines live in [`.claude/`](./.claude):
  - `typescript.md` — type-level conventions
  - `bun.md` — Bun-specific APIs
  - `comments.md` — when (and when not) to write comments
  - `testing.md` — how tests are organized
  - `architecture.md` — repo layout and design
- The package **ships its `src/`**, so source comments reach consumers. Keep them accurate.

## Reporting issues

Use the [issue tracker](https://github.com/amritk/niv/issues). Please include:

- The version you are on
- A minimal component or snippet that reproduces the problem
- Expected vs. actual rendering or binding behaviour

## Security

See [SECURITY.md](./SECURITY.md) for how to report vulnerabilities.

## License

By contributing you agree your contributions will be licensed under the [MIT License](./LICENSE).
