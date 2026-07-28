---
'@amritk/mini-lynx': patch
---

Document that `@amritk/mini`'s called-signal check already covers a `mini-lynx` codebase, and that no second copy is shipped on purpose.

`show={visible()}` is the one mistake this runtime cannot catch. The call happens at the JSX call site, so the runtime never sees a signal — it sees an ordinary boolean — and a called signal is a valid value, so the type checker has nothing to object to either. The source is the only place left.

`@amritk/mini`'s scanner is purely syntactic: it looks for a zero-argument call to something it can see is a signal, inside a JSX binding that is not itself a function. Nothing in it knows which runtime the JSX belongs to. So the fix was to say so rather than to ship a duplicate that would then need keeping in step.

The README now covers both build shapes, which is the part that was actually missing. `catchCalledSignals()` from `@amritk/mini/vite` covers a web preview — live warnings in the dev server, a hard failure on `vite build`. A device build usually is not Vite (Lynx builds with rspack), so `findCalledSignalBindings` is the bundler-agnostic path; this repository's own `check:reactivity` gate is that function in about forty lines. `@amritk/mini` is a dev dependency for this, so nothing from the web-only package follows an app onto the device.
