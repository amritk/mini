---
'@amritk/mini-lynx': patch
---

Restore the README's *Known gaps* section, which two other documents were already pointing at.

`docs/mini-lynx-audit.md` closes by saying the live list of what is missing "lives in the package README's *Known gaps* rather than here", and a previous changeset said the same. That section did not survive the Lynx rewrite of the README, so both pointers led nowhere and the actual gaps were left scattered across source comments and section 7 of the design note — which is the worst place for them, since the people who need them are the ones deciding whether to adopt the package.

The list is five items, each stated with what it costs rather than just named: `<list>` does not recycle yet (the engine's `__CreateList` takes the recycling callbacks the framework must implement, so every row is realised up front); there is no `SelectorQuery` wrapper and so no UI methods; gesture composition is not exposed, though the touch stream is enough to recognise one by hand; nothing about the background thread is this package's, which is sharpest for `/query`; and reduced motion is a real regression from the deleted `/animate`, which honoured it for free.

The audit's closing paragraph is corrected too. It enumerated a stale list — pinch and rotate, variable row sizes, a responsive primitive, capability flags, an interactive back gesture — as though it were the README's current contents, when in fact the Lynx rewrite dissolved most of those rather than delivering them: gestures and windowing became the engine's, and stopped being this package's to build.
