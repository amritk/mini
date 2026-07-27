# `@amritk/playground-mini-native`

A kitchen-sink demo of every public entry point of
[`@amritk/mini-native`](../../packages/mini-native), rendered through the DOM
host and deployed to Cloudflare Workers as a static SPA.

Private, unpublished, and not part of the release. Read it as what it is: a
**web preview of a native app**. The whole app is written in the five-tag native
vocabulary and the `/ui` layer, there is no `<div>` and no stylesheet inside
`#app`, and picking `createDomHost()` in `src/main.tsx` is the only line that
knows it is on the web. Point `setHost` at a different host and the same tree
renders somewhere else — which is the claim the package makes, and `/composition`
demonstrates it live by rendering a component through the in-memory host and
printing the object tree it produced.

## Running it

```sh
bun install                                               # from the repo root
bun run --filter '@amritk/playground-mini-native' dev      # vite dev server
bun run --filter '@amritk/playground-mini-native' build    # static bundle into dist/
bun run --filter '@amritk/playground-mini-native' preview  # serve the built bundle
```

The root `bun run build` and `bun run types:check` include this app.

## What is on each screen

| Route | Entry point | What it shows |
| --- | --- | --- |
| `/` | `@amritk/mini-native` | The vocabulary: `view`, `text`, `image`, `scroll-view`, `input`, `role`, events |
| `/ui` | `@amritk/mini-native/ui` | `Heading`, `Text`, `Button`, `Link`, `List`, `ListItem`, `Stack`, `Row`, `ThemeContext` |
| `/flow` | `@amritk/mini-native/flow` | `Show`, `Switch`/`Match`, `For`, `Index`, `Dynamic`, and `list` underneath |
| `/gestures` | `@amritk/mini-native/gestures` | `pan`, `swipe`, and the raw `onPointer` stream |
| `/platform` | `@amritk/mini-native/platform` | `colorScheme`, `dimensions`, `safeArea`, `platform.os`/`select` |
| `/composition` | `@amritk/mini-native/composition` | `createContext`, `Portal`, `ErrorBoundary`, plus a live host swap to `hosts/memory` |
| `/routing` | `@amritk/mini-native/router` | `createRouter`, `RouteView`, `RouteLink`, `createBrowserHistory`, `createMemoryHistory`, `matchRoute` |

## The two conventions the app follows, on purpose

**Screens contain almost no vocabulary tags.** Everything is `/ui` or a
component in `src/lib/ui.tsx`, which is what the `/ui` docs ask for and what
would make changing the vocabulary a rewrite of one directory rather than of the
app. `Action` there is the clearest illustration of the line the layer draws:
`<Button>` brings the semantics, the app brings the 8px radius.

**Styling is `style` bags of density-independent pixels.** A bare number means
dp and the host adds the unit, so the same bag means the same thing on every
target. The only CSS in the app is in `index.html`, and it stops at the page:
the background, the device-shaped viewport on a desktop, and the overlay layer
that `Portal` targets. The layout reset that makes a browser lay out like Yoga
comes with the host, not from that stylesheet.

## How it resolves the package

`vite.config.ts` and `tsconfig.json` both pin the `development` condition, so
`@amritk/mini-native` and every subpath resolve to `packages/mini-native/src`
rather than to `dist/`. The playground therefore runs in a fresh clone with no
prior build and always exercises the code in this checkout.

`vite.config.ts` also sets `resolve.extensions` with `.web.tsx` first — the
bundler seam `@amritk/mini-native/platform` documents for whole-component
divergence. Nothing needs it yet; it is wired so that the day something does,
the answer is a new file rather than an inline `platform.os` branch.

There is no hot-mount equivalent here (`@amritk/mini-native` ships no `/hot`),
so an edit full-reloads the page.

## Deploying

An assets-only Worker: no `main`, so Cloudflare serves `dist/` from its edge
cache without invoking a Worker. `not_found_handling: "single-page-application"`
rewrites unknown paths to `index.html`, which is what lets
`createBrowserHistory` run in `history` mode and makes `/gestures` a URL you can
reload and share.

```sh
bun run --filter '@amritk/playground-mini-native' deploy      # build + wrangler deploy
bun run --filter '@amritk/playground-mini-native' deploy:dry  # build + validate, no upload
```

`wrangler` needs `CLOUDFLARE_API_TOKEN` (and `CLOUDFLARE_ACCOUNT_ID` when the
token can see more than one account). `.github/workflows/deploy-playgrounds.yml`
does the same on a push to `main`, and skips itself when the secret is absent.
