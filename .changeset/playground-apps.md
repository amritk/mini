---
---

Add two private kitchen-sink playgrounds under `apps/`, deployed to Cloudflare Workers as static SPAs.

`@amritk/playground-mini` and `@amritk/playground-mini-lynx` exercise every public entry point of their package in a running app: signals, the JSX runtime, every binding, `template`, `list`, `/flow`, `/forms` (both the function and JSON Schema arms), `/query`, `/router` and `/hot` on one side; the five-tag vocabulary, `/ui`, `/flow`, `/gestures`, `/platform`, `/composition` and `/router` on the other. The native one is a **web preview of a native app** — no `<div>` and no stylesheet inside the app root, styling through `style` bags of density-independent pixels — and it swaps in the in-memory host live to print the object tree the same components produce there.

Both are assets-only Workers: no `main`, so Cloudflare serves `dist/` from its edge cache without invoking a Worker, and `not_found_handling: "single-page-application"` is what lets each app's router run in `history` mode and survive a hard reload. `.github/workflows/deploy-playgrounds.yml` type-checks, builds and deploys both on a push to `main`.

They resolve the packages through the `development` condition — pinned in each app's `vite.config.ts` and `tsconfig.json` — so they build from `src`, always exercise the code in the checkout, and run in a fresh clone with no prior `bun run build`. Packaging stays `scripts/consumer-e2e.test.ts`'s job, which packs and installs real tarballs.

The point of them is that they are the only code in the repo written the way a consumer writes it, so they are where composition-level defects show up rather than primitive-level ones. Three did on the way in, each fixed separately here: `renderChild` subscribing its branch swap to signals a component body read while building, the DOM host reading `lineHeight` as CSS's multiplier rather than as dp, and `pan` measuring the end velocity across the lift rather than across the last movement.

Repo plumbing that came with them: `apps/*` joins the workspaces, root `build` and `types:check` cover the playgrounds (so a breaking package change fails CI there too), root `test` narrows to `./packages/*` since the playgrounds carry no tests of their own, and `bun run check:reactivity` now scans `apps/` as well — the called-signal footgun is a consumer's mistake to make, so consumer-shaped code is where to look for it.
