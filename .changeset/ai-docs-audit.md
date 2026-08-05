---
'@amritk/lynx-deep-linking': patch
'@amritk/lynx-notifications': patch
'@amritk/lynx-dialogs': patch
'@amritk/lynx-location': patch
'@amritk/mini-lynx': patch
'@amritk/mini': patch
---

Bring every package's shipped `AI.md` back in line with what that package
actually publishes, and add `bun run check:ai-docs` so it cannot drift again.

The files had gone stale in the way generated-and-committed docs always do —
silently, and only for the audience that cannot file an issue about it.
`@amritk/mini` never documented `watch`, `template`, the typed `matchRoute` /
`buildPath` re-exports on `/router`, `Field` on `/forms`, or the `/vite` subpath
at all; `@amritk/mini-lynx` was missing `computed` / `effectScope`,
`fadeTransition`, `keepAboveKeyboard` and `HANDLER_PREFIX`;
`@amritk/lynx-notifications` documented neither its `/testing` subpath nor the
fake behind it. All four native packages exported `MODULE` and `EVENTS` with no
mention of what they are for, and only `@amritk/lynx-dialogs` showed how to wire
a fake into `installNativeBridge` — which is the one thing a consumer testing
its own screens needs.

Two accuracy fixes matter more than the additions. Every native package's
*Status* section claimed the Objective-C compiles against the real Lynx pod; the
macOS CI job was disabled on cost, so it now compiles only when somebody runs
`pod lib lint` by hand, and the docs say that. And `@amritk/lynx-dialogs` never
carried a *Status* section at all, so nothing in it told a reader that none of
it has run on a device.

`bun run check:ai-docs` reads each package's `exports` and fails on a runtime
export, a published subpath, or (for a package shipping native sources) a
*Status* section its `AI.md` never mentions. It runs early in CI, before the
build. Exports no consumer ever writes — the tree operations the JSX transform
calls, and the like — are listed in `INTERNAL_EXPORTS` with the reason.
