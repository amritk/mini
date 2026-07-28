---
'@amritk/mini-helpers': minor
---

First release of `@amritk/mini-helpers` — the pure helpers `@amritk/mini` and
`@amritk/mini-lynx` both need, with no reactivity, no platform and no
dependencies.

`matchRoute`/`parseQuery` and `schemaToValidator` were duplicated between the
two runtimes — `matchRoute` and `schemaToValidator` byte-for-byte — which is
exactly the drift this repo has paid for before. They now live here, under a
charter `purity.test.ts` enforces: nothing on the `.` entry carries a
dependency at all.

Neither runtime's public surface changes. The three helpers are still exported
from `@amritk/mini/router`, `@amritk/mini/forms` and their `@amritk/mini-lynx`
counterparts, so no import in a consuming app moves. This package is a runtime
dependency of both, so an install picks it up automatically — which is why it
has to be published rather than kept private.

One behaviour converges: `@amritk/mini`'s `parseQuery` was built on
`URLSearchParams`, a web global the native side cannot use, so the hand-rolled
implementation is the one that survived. It passes every case the old one did
and additionally tolerates a malformed escape (`?q=100%`) instead of leaning on
the platform's error handling.

The byte-budgeted `.` entries of both runtimes are untouched — `onCleanup` and
`runDetached` stay duplicated on purpose, because a shared dependency there
would be bytes in the widget's bundle.
