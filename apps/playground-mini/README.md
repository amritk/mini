# `@amritk/playground-mini`

A kitchen-sink demo of every public entry point of
[`@amritk/mini`](../../packages/mini), built with the package itself and
deployed to Cloudflare Workers as a static SPA.

Private, unpublished, and not part of the release. It exists to be the one place
in the repo where the package is used the way a consumer uses it — which is why
it is the first thing to break when an entry point regresses, and why two of the
bugs it found on the way in are fixed in `packages/`.

## Running it

```sh
bun install                                        # from the repo root
bun run --filter '@amritk/playground-mini' dev      # vite dev server
bun run --filter '@amritk/playground-mini' build    # static bundle into dist/
bun run --filter '@amritk/playground-mini' preview  # serve the built bundle
```

The root `bun run build` and `bun run types:check` include this app, so a
breaking change to `@amritk/mini` fails CI here too.

## What is on each page

| Route | Entry point | What it shows |
| --- | --- | --- |
| `/` | — | The overview and the one reactivity rule |
| `/signals` | `@amritk/mini` | `signal`, `computed`, `effect`, `batch`, `watch`, `onCleanup` |
| `/jsx` | `@amritk/mini/jsx-runtime` | Static vs reactive props, `class`, `style`, `show`, `ref` |
| `/bindings` | `@amritk/mini` | All eight `bind*` helpers plus `template()` |
| `/flow` | `@amritk/mini/flow` | `Show`, `Switch`/`Match`, `For`, `Dynamic` |
| `/lists` | `@amritk/mini` | `list` — key identity and per-row scope disposal |
| `/forms` | `@amritk/mini/forms` | `createForm`, `Field`, function and JSON Schema validation |
| `/query` | `@amritk/mini/query` | `createQuery` over `@tanstack/query-core` |
| `/router` | `@amritk/mini/router` | `createRouter`, `Link`, `RouterView`, `matchRoute` |

The app itself runs on `@amritk/mini/router` in `history` mode and mounts
through `@amritk/mini/hot`, so `/router` is documentation and implementation at
once.

## The shell

`src/styles.css` is written small-screen first, and the shell changes shape at
one breakpoint (760px). Below it the nav is a drawer behind a top bar; at or
above it the drawer's `<aside>` becomes the sticky sidebar. Nothing about the
markup changes — the drawer is one signal driving one class on the shell, and
the rest is CSS.

Two behaviours come from `src/app.tsx` rather than from the stylesheet, because
they cannot be expressed in one: changing section closes the drawer and returns
to the top of the page, and Escape closes it from a keyboard. The section, not
the path — `/router/:owner/:repo` navigates within its own page on purpose, and
that must not scroll the demo out from under you.

## How it resolves the package

`vite.config.ts` and `tsconfig.json` both pin the `development` condition, so
`@amritk/mini` and every subpath resolve to `packages/mini/src` rather than to
`dist/`. That means the playground runs in a fresh clone with no prior build,
always exercises the code in this checkout, and needs no `paths` table kept in
sync with the exports map.

The one thing that cannot resolve that way is `@amritk/mini/vite` — Vite loads
its own config with plain Node resolution — so `vite.config.ts` imports the two
plugins by relative path. Both are on: `catchCalledSignals` fails the build on
`attr={signal()}`, and `acceptHotUpdates` makes `src/main.tsx` the hot-update
boundary.

Packaging is deliberately *not* what this app checks. `scripts/consumer-e2e.test.ts`
packs and installs real tarballs for that, which is the honest test of it.

## Deploying

An assets-only Worker: no `main`, so Cloudflare serves `dist/` from its edge
cache without invoking a Worker. `not_found_handling: "single-page-application"`
rewrites unknown paths to `index.html`, which is what makes a hard reload of
`/forms` work in `history` mode.

```sh
bun run --filter '@amritk/playground-mini' deploy      # build + wrangler deploy
bun run --filter '@amritk/playground-mini' deploy:dry  # build + validate, no upload
```

`wrangler` needs `CLOUDFLARE_API_TOKEN` (and `CLOUDFLARE_ACCOUNT_ID` when the
token can see more than one account). `.github/workflows/deploy-playgrounds.yml`
does the same on a push to `main`, and skips itself when the secret is absent.
