---
'@amritk/mini-lynx': patch
---

Bring the generated LLM docs back in line, and add the CI check that keeps them there.

`llms.txt` and `llms-full.txt` are generated from the packages' `AI.md` files and committed, and nothing verified the two agreed. They had drifted far enough to describe a design that no longer exists: the committed `llms-full.txt` still introduced this package as "a React-Native-shaped UI runtime", still documented `onTap` instead of `bindtap`, still claimed the vocabulary was `view | text | image | scroll-view | input`, and still pointed at a `/ui` layer that was deleted with the cross-platform host. That is the worst possible staleness, because the audience for that file is agents, who have no way to notice they are being told about a package that is not the one they are installing.

CI now regenerates both files and fails on a diff, which is a two-line guard for a class of drift that is otherwise invisible — a committed build artifact goes stale silently and only for the audience that cannot complain.

`AI.md` also gains a *What this runtime does not do* section, mirroring the README's *Known gaps* but written for the reader who is deciding what to build rather than whether to adopt: `<list>` does not recycle, there is no `SelectorQuery` wrapper and so no UI methods, gesture composition is not exposed, the background thread is the app's, and reduced motion is not read for you. An agent that plans an app around list virtualisation should learn that from the docs rather than from a device.
