---
'@amritk/mini-lynx': minor
---

Add the semantics layer: every element now takes `role`, plus `level`, `label`, `hint`, `focusable`, `disabled`, `selected`, `checked`, `expanded`, and `href`.

One prop, two targets. A native host maps `role` onto an accessibility role; the DOM host builds the actual element, so `role="button"` is a real `<button>` — focus order, Enter and Space activation, and form submission come from the browser rather than being re-synthesised onto a `<div>`. `role` and `level` are static, like `input multiline`, because they decide what the host builds and a node cannot change what it is; a getter is now reported rather than silently read once.

The `Host` contract gains no methods: `role` and `level` arrive through `createElement`'s existing props parameter and the rest through `setProperty`.

**Breaking:** `image`'s `alt` is folded into `label`, which is now the single spelling of an accessible name across the vocabulary; `input`'s `disabled` moves to the common prop set. Both are unchanged in behaviour, only in spelling.

Two roles deliberately do not get their obvious HTML element. `list` and `listitem` build a generic element carrying the ARIA role, because `<ul>` accepts only `<li>` — a parse-level content model — and the control-flow components insert a wrapper between a list and its items. That wrapper is now marked presentational on every host, so a node the framework inserted can never interpose in the accessibility tree, and `For`/`Index` forward `role` and `label` to an `as` container so an accessible collection is expressible at all.
