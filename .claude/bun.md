# Bun

Bun is the development toolchain here — install, run, test, build. Default to
it instead of Node.js **for repo tooling**.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so do not use dotenv.

## The published packages are not Bun code

`packages/mini` and `packages/mini-lynx` ship to browsers and native hosts.
Their tsconfigs are deliberately browser-only (`lib` without Node, `types: []`),
and they ship their `src/` to consumers — so **no Bun or Node API may appear in
shipped package sources**, not even behind a guard. `Bun.file`, `node:fs`,
`process`, and friends belong to `scripts/`. The one exception is a test that
walks the source tree (`import-boundary.test.ts`), which pulls Node's types in
explicitly with a `/// <reference types="node" />` because the package tsconfig
withholds them — and tests never ship.

The packages are also built with `tsgo` + `tsc-alias` (see each package's
`build` script), not `bun build`. `esbuild` is a deliberate devDependency: it is
how `scripts/bench-compare.ts` measures the bundle a consumer would actually
download, so leave those calls alone.

## APIs

For `scripts/` — the release, bench, and dist-smoke tooling:

- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa
- `Bun.Glob` for glob matching: `new Bun.Glob("**/*.ts").scan(".")`
- `Bun.TOML.parse(str)` to parse TOML strings
- `Bun.inspect(value)` like `util.inspect` but Bun-native

One exception, and it matters: `scripts/e2e-helpers.ts` shells out to **plain
`node`** on purpose. `dist-smoke.test.ts` and `consumer-e2e.test.ts` exist to
prove the published artifacts load without Bun's resolver smoothing anything
over, so those tests use `node:child_process` and `node:fs` rather than Bun's
equivalents.

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Testing

This project uses [Vitest](https://vitest.dev) — see `.claude/testing.md`.
`bun run test` runs both packages; `bun run test:dist` runs the built-artifact
tests under `scripts/` and needs a prior `bun run build`.

## Frontend

Unlike most Bun projects, **this repo's frontend story is Vite, not
`Bun.serve()` with HTML imports**: `@amritk/mini` publishes a Vite plugin
(`@amritk/mini/vite`) that wires the JSX transform, flags the called-signal
footgun, and drives hot updates through `@amritk/mini/hot`. `vite` is an
optional peer and a devDependency for that reason. Do not replace it with Bun's
bundler, and do not reach for React — the whole point of these packages is that
a component runs once and signals mutate real nodes from then on.

## Workspaces and Catalogs

Bun's built-in workspace and catalog support manages this monorepo. Shared
dependency versions live in the root `package.json` under `"catalog"`:

```json#package.json (root)
{
  "workspaces": ["packages/*"],
  "catalog": {
    "alien-signals": "3.2.1"
  }
}
```

Workspace packages reference them with `"catalog:"`:

```json#packages/mini/package.json
{
  "dependencies": {
    "alien-signals": "catalog:"
  }
}
```

Named catalogs group related dependencies (`"catalogs": { "react18": { … } }`)
and are referenced as `"catalog:react18"`.

### Rules this repo enforces

- **Every runtime dependency shared by both packages goes through the
  catalog.** `alien-signals` is the reactive core of both; two manifests free to
  pin it separately is how a consumer ends up with two signal graphs, where an
  effect created through `mini` never sees a write made through `mini-lynx`.
  `scripts/workspace-protocol.test.ts` fails if a shared `dependencies` entry
  skips the catalog, and if a catalog entry no package references goes stale.
- **Never hand-edit a `catalog:` specifier into a version.** Change the version
  once, in the root catalog.
- **npm understands neither `catalog:` nor `workspace:`.** `changeset publish`
  packs via npm, so `scripts/resolve-workspace-protocol.ts` rewrites both to
  concrete ranges in the ephemeral publish job (never committed). A specifier
  that survives that step ships literally and breaks every install —
  `scripts/consumer-e2e.test.ts` packs and installs tarballs the same way the
  release does to keep that honest.
- `bunfig.toml` quarantines new releases for five days (`minimumReleaseAge`)
  before they can enter the lockfile. `@amritk/runtime-validators` is excluded
  because it is our own package, published from the mjst repo — the reasoning
  for the quarantine does not apply to it.
