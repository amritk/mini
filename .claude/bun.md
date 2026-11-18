# Bun

Bun is the development toolchain here — install, run, test, build. Default to
it instead of Node.js **for repo tooling**.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so do not use dotenv.

## The published package is not Bun code

`@amritk/niv` ships to browsers. The root `tsconfig.json` is deliberately
browser-only (DOM libs, `types: []`), and the package ships its `src/` to
consumers — so **no Bun or Node API may appear in shipped sources**, not even
behind a guard. `Bun.file`, `node:fs`, `process`, and friends belong to
`scripts/`. The one exception is a test that walks or bundles the source tree
(`import-boundary.test.ts`, `core-size-budget.test.ts`), which pulls Node's
types in explicitly with a `/// <reference types="node" />` because the
tsconfig withholds them — and tests never ship.

The package is built with `tsgo` + `tsc-alias` + `scripts/strip-comments.mjs`
(the `build` script), not `bun build`. `esbuild` is a deliberate
devDependency: it is how `scripts/bench-compare.ts` and
`src/core-size-budget.test.ts` measure the bundle a consumer would actually
download (and what `strip-comments.mjs` transforms `dist/` with), so leave
those calls alone.

## APIs

For `scripts/` — the bench, AI-docs, reactivity-check and dist-test tooling:

- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa
- `Bun.Glob` for glob matching: `new Bun.Glob("**/*.ts").scan(".")`
- `Bun.TOML.parse(str)` to parse TOML strings
- `Bun.inspect(value)` like `util.inspect` but Bun-native

Two exceptions, and they matter:

- `scripts/e2e-helpers.ts` shells out to **plain `node`** on purpose.
  `dist-smoke.test.ts` and `consumer-e2e.test.ts` exist to prove the published
  artifacts load without Bun's resolver smoothing anything over, so those tests
  use `node:child_process` and `node:fs` rather than Bun's equivalents.
- The `.mjs` scripts (`strip-comments.mjs`, `check-publishable.mjs`) are run
  with plain `node` by the `build` and `prepublishOnly` scripts, and
  `prepublishOnly` fires inside `changeset publish`, where npm rather than Bun
  is driving. Keep them plain Node ESM.

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Testing

This project uses [Vitest](https://vitest.dev) — see `.claude/testing.md`.
`bun run test` runs the unit suite; `bun run test:dist` runs the built-artifact
tests under `scripts/` and needs a prior `bun run build`.

## Frontend

Unlike most Bun projects, **this repo's frontend story is Vite, not
`Bun.serve()` with HTML imports**: the package publishes a Vite plugin
(`@amritk/niv/vite`) that flags the called-signal footgun and drives hot
updates through `@amritk/niv/hot`, and the playground is a Vite app. `vite` is
an optional peer and a devDependency for that reason. Do not replace it with
Bun's bundler, and do not reach for React — the whole point of the package is
that a component runs once and signals mutate real nodes from then on.

## Dependencies

This is a single-package repo: no workspaces, no `catalog:`, no `workspace:`
specifiers. The root `package.json` is the published manifest, so what is
written there is exactly what npm ships.

- **`alien-signals` is pinned directly** in `dependencies` (`3.2.1`). It is
  the only runtime dependency of the `.` entry; everything else a subpath needs
  is an **optional peer** (`@amritk/runtime-validators`, `@tanstack/query-core`,
  `typescript`, `vite`) and a devDependency for the suite.
- **The playground has no manifest of its own.** Anything it needs at dev time
  is a root devDependency (`wrangler`, for instance), so keep that list honest
  when you add to the playground.
- `bunfig.toml` quarantines new releases for five days (`minimumReleaseAge`)
  before they can enter the lockfile. `@amritk/runtime-validators` is excluded
  because it is our own package, published from the mjst repo — the reasoning
  for the quarantine does not apply to it.
