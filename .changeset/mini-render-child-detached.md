---
'@amritk/mini': patch
---

Fix a control-flow branch being rebuilt — and its local state reset — by any signal its component body read while building.

`renderChild` is the reactive single-slot swap behind `Show`, `Switch`, `Dynamic`, `For`'s fallback and `RouterView`, and it built the branch inside its own tracking effect. A component body runs during that build, so any signal it read SYNCHRONOUSLY — not inside one of its own bindings, but in the body itself — became a dependency of the swap. Writing that signal then re-ran the swap, disposed the branch and built a new one, handing the component a fresh set of local signals on a change that selected no new branch at all.

`@amritk/mini/query` is the case that surfaces it: `createQuery` reads its options getter in the component body to seed the observer, so a routed page whose query key came from a signal reset that signal to its initial value the moment anything wrote to it — the write appeared to do nothing.

The branch is now built through `runDetached`, exactly as `list` already builds a row, so only `select` decides when a branch is rebuilt. Detaching also moves the last branch's teardown off an alien-signals implementation detail, so `renderChild` registers it with `onCleanup` and unmounting the owning component still disposes it.

`@amritk/mini-native`'s `renderChild` already built branches detached and was unaffected; it gains the matching regression test.
