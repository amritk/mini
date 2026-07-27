---
'@amritk/mini-native': patch
---

Bring the documentation back in line with the package, now that everything the audit called the native story has shipped.

The stalest line was in `AGENTS.md`, which still said `size` and `tone` were missing from `/ui` "waiting on a type scale and a theme" — both of which shipped with the component layer. An agent reading that before editing the package would have been told to build something that already exists, which is the specific failure mode a contributor guide has.

`docs/mini-native-audit.md` is now marked **closed** rather than left reading as a roadmap. Each section 3 item carries what actually shipped, including the two that shipped differently from the plan: `VirtualFor` is not bound to a platform recycler (this runtime already has the recycler's model, so the window is the ordinary keyed list keyed by slot), and the animation seam turned on a rule the audit did not anticipate (no `fill`, so an animation never leaves a style behind).

The README gains sections for `/animate`, `/forms`, and `/query`, `VirtualFor` in the control-flow table, and `reduceMotion` in the platform table. Its *Known gaps* is rewritten: the entries that were satisfied are gone, and the ones that replace them are narrower and mostly waiting on a real screen — pinch and rotate, variable row sizes, a navigation stack that is now buildable since the seam it needed exists. Two new honest limitations are stated rather than left to be discovered: the Lynx animator sequences between keyframes with timers, and happy-dom implements no Web Animations API, so the DOM host's suite verifies the adapter rather than the animation.

`AI.md` and the generated `llms-full.txt` follow.
