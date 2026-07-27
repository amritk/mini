---
'@amritk/mini-helpers': minor
'@amritk/mini-lynx': minor
'@amritk/mini': minor
---

Factor the helpers both packages need into `@amritk/mini-helpers`

`matchRoute`/`parseQuery` and `schemaToValidator` were duplicated between the
two runtimes — `matchRoute` and `schemaToValidator` byte-for-byte — which is
exactly the drift the repo has paid for twice before. They now live in one
package, under a charter its own `purity.test.ts` enforces: **no reactivity, no
platform**, and nothing on the `.` entry that carries a dependency at all.

Neither package's public surface changes. `matchRoute`, `parseQuery` and
`schemaToValidator` are still exported from `@amritk/mini/router`,
`@amritk/mini/forms` and their `@amritk/mini-lynx` counterparts, so no import
in a consuming app needs to move. The new package is a runtime dependency of
both, so an install picks it up automatically.

One behaviour converges: `@amritk/mini`'s `parseQuery` was built on
`URLSearchParams`, a web global the native side cannot use, so the hand-rolled
implementation is the one that survived. It passes every case the old one did
and additionally tolerates a malformed escape (`?q=100%`) instead of leaning on
the platform's error handling.

The byte-budgeted `.` entries are untouched — `onCleanup` and `runDetached` stay
duplicated on purpose, because a shared dependency there would be bytes in the
widget's bundle.
