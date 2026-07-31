---
"@amritk/mini-lynx": minor
---

Accept `text-maxline` as `number | string`. The shipped `@lynx-js/types` declare the attribute a `string` while the docs' code block declares `number`, and following the types verbatim made `text-maxline={2}` a compile error with `"2"` as the workaround. The vocabulary now takes both forms, and the runtime stringifies a number just before `__SetAttribute`, so the engine still receives exactly the string the shipped types promise — from `applyProp` and `bindProp` alike.

Also fixes the playground's DOM preview reset: a `<text>` nested in a `<text>` now renders `display: inline`, matching the `inline-text` the engine compiles it to, instead of breaking every styled run onto its own line.
