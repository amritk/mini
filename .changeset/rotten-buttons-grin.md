---
'@amritk/lynx-deep-linking': minor
---

Add `@amritk/lynx-deep-linking` — deep links for Lynx, as an Android native
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
