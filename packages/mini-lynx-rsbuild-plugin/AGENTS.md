# AGENTS.md — @amritk/mini-lynx-rsbuild-plugin

Contributor guide for AI agents editing **this package**. Repo-wide rules:
[`../../AGENTS.md`](../../AGENTS.md) and [`../../CLAUDE.md`](../../CLAUDE.md).
Consuming the package instead? See [`AI.md`](./AI.md).

The rspeedy build for a `@amritk/mini-lynx` app: two chunks, one
`.lynx.bundle`, and the dev server Lynx Explorer scans. It is the only package
here that runs on a laptop rather than on a phone.

## Commands

```bash
bun run --filter='@amritk/mini-lynx-rsbuild-plugin' test
bun run --filter='@amritk/mini-lynx-rsbuild-plugin' types:check
bun run --filter='@amritk/mini-lynx-rsbuild-plugin' build
```

`apps/starter-mini-lynx` is this package's playground — the only place it is
used the way a consumer uses it. `cd apps/starter-mini-lynx && bun run build`
is the fastest end-to-end check; `bun run dev` is the one that involves a
device.

## Layout

```
src/
  index.ts               The `.` entry: pluginMiniLynx and its options
  plugin.ts              The plugin — entries, template, encoder, JSX, dev client
  main-thread-info.ts    The rspack plugin that flags the main-thread chunk
  background-stub.ts     The default background chunk: an empty module
  build.test.ts          A real rspeedy build, then its output, run for real
fixture/                 The app build.test.ts builds. Not published.
```

## Invariants — do not break these

- **The main-thread flag is the whole game.** The encoder splits an entry's
  assets by one `lynx:main-thread` boolean on the asset info and treats
  everything else as background code. Lose it and the build still succeeds, the
  template still encodes, and the app has no first screen — a failure with no
  error anywhere. `main-thread-info.ts` sets it; `build.test.ts` asserts the
  main-thread slot is filled.
- **The runtime wrapper goes on the background chunk only.** It emits the
  `tt.define` the engine's module loader needs. Wrapped around the main-thread
  chunk it would register a module nobody requires; unwrapped, the background
  chunk cannot be loaded at all. `NOT_MAIN_THREAD` is the regex that keeps them
  apart, and both directions are asserted.
- **The background entry keeps the original entry name.** rspeedy derives the
  template filename, the dev server's URLs and the QR code from
  `source.entry`'s keys. Renaming that entry moves the URL the phone fetches
  and breaks the QR code without breaking the build.
- **Module load stays free of side effects.** `@lynx-js/template-webpack-plugin`
  opens a worker pool the moment it is imported, and this package is imported by
  things that never build anything — a consumer's smoke test, an editor, the
  repo's own `dist-smoke` sweep, which imports every published module under
  Node. Both heavy imports are dynamic, inside `modifyBundlerChain`. Keep them
  there.
- **No hot update path.** A component runs once here, so there is nothing for a
  module-level diff to be applied to. The dev build adds the transport client
  and `@rspack/core/hot/dev-server` so that an update nothing accepts falls
  through to a devtool reload, which is the only correct outcome. Do not add
  `module.hot.accept` anywhere, and do not add a refresh runtime.
- **Nothing here may know about the app.** No injected imports, no globals, no
  generated entry wrapper. `renderPage` is the app's own line, and the whole
  reason the runtime can be tested and the bundle can be reasoned about is that
  the build adds nothing to the graph the app did not ask for. The one exception
  is the two dev-only modules above, which exist only in `dev` and only in the
  background chunk.

## Testing

`build.test.ts` runs real rspeedy builds of `fixture/` — with and without a
background module — and then **runs the artifact**: the main-thread chunk is
pulled out of the encoder's input and executed in a `node:vm` context whose
globals are `createFakeEngine`'s Element PAPI, which is the same shape the
engine presents, minus a screen. A JSX transform pointed at React, a wrapper on
the wrong chunk, a `renderPage` that never reached the global: each is a passing
string search and a blank screen on the phone, and each fails there instead.

The fixture resolves `@amritk/mini-lynx` to the runtime's **source** through an
rspack alias, mirroring what `vitest.config.ts` does for every other suite here,
so a test never depends on a prior `bun run build`.

What the suite cannot answer is whether the engine agrees: layout, the devtool
connection, the reload, and whether a given Explorer accepts the template's
`targetSdkVersion`. [`docs/mini-lynx-explorer.md`](../../docs/mini-lynx-explorer.md)
records what has been checked on hardware and what has not.

## Versions this was built against

rspeedy `0.16.4`, `@lynx-js/template-webpack-plugin` `0.15.1`,
`@lynx-js/runtime-wrapper-webpack-plugin` `0.2.3`. Every JS-side Lynx package is
still 0.x and the template plugin's hooks are marked `@alpha` upstream, so a
minor bump there can move this package's ground. The build test is what will
tell you: it fails on the artifact rather than on the API.
