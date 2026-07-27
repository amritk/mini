---
'@amritk/mini-lynx': patch
---

Add a keyed js-framework-benchmark example and `bun run bench:reconciler`, a wall-clock harness for it.

The keyed list already carried a move-minimal guarantee, and that guarantee was asserted in **host calls**: swapping two rows costs two inserts, removing from the middle costs none. That proves the algorithm and says nothing about the clock — an O(1) operation is still slow if the constant is. This is the missing number.

It measures against the **memory host**, whose operations are array splices on plain objects, so what is left is very nearly the runtime's own overhead: building rows, tracking effects, diffing key order. That is the thing this package can be held responsible for. A figure from a browser or a device would be dominated by that platform's layout and commit costs, which move with the browser version and the phone. To measure a real target, drop the example into the actual benchmark harness — the same `index.html`/`bootstrap.ts` runs it through the DOM host, with the app itself unchanged.

Host-call counts are printed next to the milliseconds, because a time is only interpretable next to the amount of work it covers, and because it is where a reconciler regression shows up first: a swap that stops being two inserts is visible immediately, where a few milliseconds of drift is not.

**Two of `@amritk/mini`'s four benchmark techniques are unavailable here, and that is the interesting part of the mirror rather than a shortfall in it.** There is no template cloning — an engine has no HTML parser and no way to deep-copy a subtree, so a row is built element by element, and the create columns show what that costs. And there is no event delegation — native targets have no bubbling phase, which is why `Host.addEventListener` has neither delegation nor listener options, so a thousand rows really is two thousand listeners. Pretending otherwise would mean measuring something no app could ship.

The two that carry over are the keyed diff and O(1) selection. The web version does the select imperatively with `classList`; this uses a signal per row, which is the same complexity and stays inside the graph. There is no imperative "set this prop once" API here, and adding one to win a benchmark column would have been the wrong trade.
