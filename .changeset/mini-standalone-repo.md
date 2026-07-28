---
---

Move `@amritk/mini` and `@amritk/mini-lynx` out of the [mjst](https://github.com/amritk/mjst) monorepo into their own repository at [amritk/mini](https://github.com/amritk/mini).

The two packages had no code dependency on anything else in mjst — nothing there imported them, and the only cross-package tie was `@amritk/runtime-validators`, an *optional* peer behind `@amritk/mini/forms`' schema arm. It is now consumed from npm like any other third-party dependency, which is exactly how a consumer of that subpath already got it.

Everything that made the packages work travels with them: the Bun workspace and its tsconfig chain, biome, changesets and the trusted-publishing release workflow, the `check:reactivity` footgun guard, the `strip-comments` build step, the dist smoke test, and the agent guidelines under `.claude/` and each package's `AGENTS.md`. The benchmark that used to time codegen suites is now purely what it always was for these packages — a per-entry gzipped bundle-size delta posted to the PR description, extended to cover `mini-lynx`'s entries and hosts too.

No published API changes. The `repository`, `homepage`, and `bugs` fields in both manifests now point at the new repo.
