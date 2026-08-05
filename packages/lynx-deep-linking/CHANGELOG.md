# @amritk/lynx-deep-linking

## 0.2.1

### Patch Changes

- Updated dependencies [40cbdb5]
  - @amritk/mini-lynx-native@0.2.1

## 0.2.0

### Minor Changes

- c657444: Add `@amritk/lynx-deep-linking` — deep links for Lynx, as an Android native
  module, an iOS native module and a promise-shaped facade over
  `@amritk/mini-lynx-native`.

  Lynx ships no linking module, and the two published community packages are parts
  of frameworks rather than libraries: `@sigx/lynx-linking` needs `@sigx/lynx-core`
  and a `sigx prebuild` step, `@tamer4lynx/tamer-linking` peers on ReactLynx and
  links through the `t4l` CLI, and neither reaches the main thread a `mini-lynx`
  tree renders on.

  Inbound, the launch URL is a value (`getInitialURL`) and every later link is an
  event (`onDeepLink`), so an app can handle both without handling one tap twice;
  a link that arrives with no view up is held natively and replayed once. Outbound,
  `openURL`, `canOpenURL` and `openSettings` — the last being the missing half of
  the `denied` states `@amritk/lynx-location` and `@amritk/lynx-notifications`
  report. `parseURL` and `createURL` are pure and need no bridge.

  Cold start needs no host wiring on either platform; a link into a running app
  needs one forwarded callback, which no library can observe for itself.

### Patch Changes

- 1b6c33d: Bring every package's shipped `AI.md` back in line with what that package
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
  _Status_ section claimed the Objective-C compiles against the real Lynx pod; the
  macOS CI job was disabled on cost, so it now compiles only when somebody runs
  `pod lib lint` by hand, and the docs say that. And `@amritk/lynx-dialogs` never
  carried a _Status_ section at all, so nothing in it told a reader that none of
  it has run on a device.

  `bun run check:ai-docs` reads each package's `exports` and fails on a runtime
  export, a published subpath, or (for a package shipping native sources) a
  _Status_ section its `AI.md` never mentions. It runs early in CI, before the
  build. Exports no consumer ever writes — the tree operations the JSX transform
  calls, and the like — are listed in `INTERNAL_EXPORTS` with the reason.

- Updated dependencies [e025ac7]
- Updated dependencies [5101aa7]
- Updated dependencies [ab6476a]
  - @amritk/mini-lynx-native@0.2.0
  - @amritk/mini-helpers@0.2.0
