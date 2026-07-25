---
---

Cover the release-time packaging constraints that came over with the repo split
but arrived without their tests: `catalog:`/`workspace:` resolution, stripping
the `development` export condition, and the packed-tarball consumer install.

- `scripts/workspace-protocol.test.ts` — unit coverage for the resolver the
  release runs, plus repo-level guards: every specifier in this workspace
  resolves, every runtime dependency shared by both packages is declared
  `catalog:`, and the root catalog carries no entry nothing references.
- `scripts/strip-development-exports.test.ts` — the publish step that keeps
  bundlers off the shipped `src/`. `strip-development-exports.ts` now exports
  `stripDevelopmentExports`/`stripDevelopment` so it is testable, matching
  `copy-license.ts`.
- `scripts/consumer-e2e.test.ts` — packs both packages exactly as
  `release:publish` does, installs the tarballs into scratch projects, and
  checks the published manifests, every declared export subpath, the absence of
  test files, and real rendering through both packages under plain Node.
- `.claude/` guidelines adapted to this repo rather than inherited verbatim:
  catalog rules and the Vite-based frontend story in `bun.md`, how tests
  actually run in `testing.md`, import conventions in `typescript.md`.
