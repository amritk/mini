---
'@amritk/mini-lynx': patch
---

Demonstrate the whole vocabulary in the playground, and add a test that keeps it that way.

The app was building twenty-four of the vocabulary's thirty-four tags. That is the specific failure the Lynx rewrite was supposed to remove — a playground showing a subset is back to advertising a ceiling the package does not have — and it drifts in one direction only: because the vocabulary is derived from `@lynx-js/types` rather than transcribed, a tag the engine adds arrives with no release here and with nothing to make anyone notice it is undemoed.

Nine tags gained demos. The `scroll-coordinator` family — the coordinator, its header, slot, drag-slot and toolbar — is the collapsing-header-plus-pinned-toolbar shape, and is the strongest single argument for the rewrite: five tags and no gesture code, where doing it by hand means driving two scrollers from one gesture stream and reconciling them every frame. `markdown` shows a whole document arriving through one string attribute, with the typewriter animation and `content-complete` that make it the streaming-output element, and carries the one genuine irregularity in the vocabulary — its events use camelCase suffixes (`binddrawStart`, `bindimageTap`, `bindparseEnd`) where every other Lynx event is lower case. `list-row` groups several items into one laid-out unit, which is a different thing from `full-span`. `title-bar-view` is a draggable desktop window region.

`video` is the interesting one, because it demonstrates the derived vocabulary's version skew rather than a capability. It arrived in `@lynx-js/types` 4.1.0 and this repo pins the peer floor at 4.0.0, so the tag exists and takes every global attribute while its own props are unknown to the compiler — an app that bumps the types gets them with no release here. That is the mechanism working, and it is now visible instead of described.

`src/vocabulary-coverage.test.ts` reads the tag list out of the package's source and fails when a tag is not built anywhere in the app. Two are exempt with their reasons recorded: `page` is the root the framework already generates, and `component` is Lynx's own component instantiation, which this runtime does not drive. Because the vocabulary is a type, the check is necessarily a source scan — it sees a tag that is written, not one genuinely exercised — which is the right approximation, since writing the tag is what pins its attribute spellings and nesting rules.
