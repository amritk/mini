---
---

Rewrite `@amritk/playground-mini-native` on Lynx's own vocabulary, and preview it through a DOM implementation of the Element PAPI.

The app previously ran through a DOM *host* — a framework abstraction the package owned. That is gone with the rest of the `Host` layer, so the preview drops one level: `src/lib/dom-papi.ts` implements the Element PAPI itself, which is exactly what Lynx's own web target does in `@lynx-js/web-platform`. The browser is now explicitly emulating Lynx rather than being a peer target, which is the more honest arrangement — and it means the preview, not the device, is the thing that can be wrong.

Eleven screens, covering what the five-tag vocabulary could not reach: the element gallery including `svg`, `blur-view`, `viewpager`, `refresh` and `overlay`; text with `text-maxline`, inline images, custom truncation and Lynx's no-inheritance rule; `<list>` with grid and waterfall layout, sticky headers and snap; CSS as a first-class channel — classes, custom properties, `@keyframes`, `linear` and `relative` layout — with the class-toggled dark theme Lynx needs because it has no `@media`; event bubbling, `catch` interception and capture-phase handlers; control flow, composition, forms, async data and routing; and an engine screen that renders a second tree through the in-memory Element PAPI and prints the call log, so the reconciler's cost is countable.

The app now ships a real stylesheet, which the previous version deliberately did not: with a five-tag vocabulary a stylesheet was a web-only luxury, and on Lynx it is the idiomatic channel.
