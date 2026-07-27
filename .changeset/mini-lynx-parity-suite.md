---
'@amritk/mini-lynx': patch
---

Add the two structural suites that keep the hosts honest, and fix the divergence the first one found.

`parity.test.tsx` renders one component through all three hosts and compares what each reports back — role, accessible name, focusability, availability, and the payload of a tap. It compares semantics rather than markup, because asserting markup would only re-test each host's mapping table and would fail whenever a mapping legitimately changed. It exists for the failure mode cross-platform work actually has: silent drift, where the web target keeps working while the device target stops matching because nobody runs it day to day.

It earned its keep immediately. `focusable={false}` was honoured by the DOM host and erased by the other two, because `setProperty`'s general rule that `false` means "unset it" wipes out the very state these props express. `focusable`, `selected`, `checked`, `expanded`, and `selectable` now share one documented exception (`tri-state-props.ts`) that all three hosts consult, so `false`, `true`, and absent stay three distinct cases everywhere.

`vocabulary-coverage.test.tsx` asks whether every prop the vocabulary documents actually does something, by walking `ElementProps` and asserting none reaches a DOM element as a dead attribute. The audit found four that did — `fit`, `lines`, `direction`, `multiline` — by reading. A mapped type is what keeps it from rotting: it demands one sample per prop per tag, so adding a prop without adding a sample fails `types:check` rather than quietly going untested.
