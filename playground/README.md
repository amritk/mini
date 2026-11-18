# The playground

A kitchen-sink demo of every public entry point of
[`@amritk/niv`](../README.md), built with the package itself and deployed to
Cloudflare Workers as a static SPA.

Unpublished and not part of the release — the package's `files` list keeps it
out of the tarball. It exists to be the one place in the repo where the package
is used the way a consumer uses it, which is why it is the first thing to break
when an entry point regresses.

## Running it

```sh
bun install                  # from the repo root
bun run playground:dev       # vite dev server
bun run playground:build     # static bundle into playground/dist/
bun run playground:preview   # serve the built bundle
```

It has no `package.json` of its own: its dependencies are the root's
devDependencies. `bun run types:check` covers it and CI builds it, so a breaking
change to `@amritk/niv` fails CI here too.

## What is on each page

| Route | Entry point | What it shows |
| --- | --- | --- |
| `/` | — | The overview and the one reactivity rule |
| `/signals` | `@amritk/niv` | `signal`, `computed`, `effect`, `batch`, `watch`, `onCleanup` |
| `/jsx` | `@amritk/niv/jsx-runtime` | Static vs reactive props, `class`, `style`, `show`, `ref` |
| `/bindings` | `@amritk/niv` | All eight `bind*` helpers plus `template()` |
| `/flow` | `@amritk/niv/flow` | `Show`, `Switch`/`Match`, `For`, `Dynamic` |
| `/lists` | `@amritk/niv` | `list` — key identity and per-row scope disposal |
| `/forms` | `@amritk/niv/forms` | `createForm`, `Field`, function and JSON Schema validation |
| `/query` | `@amritk/niv/query` | `createQuery` over `@tanstack/query-core` |
| `/router` | `@amritk/niv/router` | `createRouter`, `Link`, `RouterView`, `matchRoute` |

The app itself runs on `@amritk/niv/router` in `history` mode and mounts
through `@amritk/niv/hot`, so `/router` is documentation and implementation at
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

`vite.config.ts` aliases `@amritk/niv` and every subpath straight to `../src`,
and `tsconfig.json` maps them the same way, so the playground runs against the
source with no build step first. The two plugins from `@amritk/niv/vite` are
imported from source by relative path for the same reason — a config file has
to load before anything else can. Both are on: `catchCalledSignals` fails the
build on `attr={signal()}`, and `acceptHotUpdates` makes `src/main.tsx` the
hot-update boundary.

Packaging is deliberately *not* what this app checks. `scripts/consumer-e2e.test.ts`
packs and installs a real tarball for that, which is the honest test of it.

## Deploying

An assets-only Worker: no `main`, so Cloudflare serves `dist/` from its edge
cache without invoking a Worker. `not_found_handling: "single-page-application"`
rewrites unknown paths to `index.html`, which is what makes a hard reload of
`/forms` work in `history` mode.

```sh
bun run playground:deploy   # build + wrangler deploy
```

`wrangler` needs `CLOUDFLARE_API_TOKEN` (and `CLOUDFLARE_ACCOUNT_ID` when the
token can see more than one account). `.github/workflows/deploy-playground.yml`
does the same on a push to `main` (to the `playground-niv` Worker), and skips
itself in any repository other than `amritk/niv`, such as a fork.
