# mini-native — js-framework-benchmark (keyed)

A keyed [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
implementation in [`@amritk/mini-native`](../../README.md), mirroring
[the one `@amritk/mini` grew](../../../mini/examples/js-framework-benchmark). It
is an **example**, not part of the published package.

It exists to answer a question the test suite could not. The keyed list carries a
**move-minimal guarantee**, and until now that guarantee was asserted in *host
calls*: swapping two rows costs two inserts, removing from the middle costs none.
That proves the algorithm and says nothing about the clock — an O(1) operation is
still slow if the constant is.

## The number

```bash
bun run bench:reconciler          # median of 10
bun run bench:reconciler --json   # for a CI diff
```

Measured against the **memory host**, whose operations are array splices on plain
objects, so what is left in the number is very nearly the runtime's own overhead
— building rows, tracking effects, diffing key order. That is the thing this
package can be held responsible for. A figure from a browser or a device would be
dominated by that platform's layout and commit costs, which move with the browser
version and the phone, and would say far more about them than about this code.

| Operation | Median (ms) | Host calls | Inserts | Removals |
|:--|--:|--:|--:|--:|
| create 1,000 rows | ~15 | 26,000 | 8,000 | 0 |
| replace all 1,000 rows | ~17 | 27,000 | 8,000 | 1,000 |
| partial update (every 10th) | ~0.3 | 100 | 0 | 0 |
| select row | ~0.03 | 1 | 0 | 0 |
| swap rows | ~0.2 | 2 | 2 | 0 |
| remove row | ~0.3 | 1 | 0 | 1 |
| clear 1,000 rows | ~3 | 1 | 0 | 1 |
| create 10,000 rows | ~127 | 260,000 | 80,000 | 0 |
| append 1,000 to 10,000 | ~21 | 26,000 | 8,000 | 0 |

Indicative, from one machine — run it yourself for a number that means something
on yours. The **shape** is the durable part, and it is the reconciler's
guarantees made visible: a swap is two inserts whatever the list's length, a
removal is one call, a clear is one, and selecting a row in a thousand is a
single property write. The create rows scale linearly and are dominated by
building eight host nodes per row, which is the honest cost of a vocabulary with
no template cloning.

To measure a real target, drop this into the actual benchmark harness. That is
what it is for, and this harness is not trying to replace it.

## Two of `mini`'s four techniques are unavailable here

That is the interesting part of the mirror, not a shortfall in it.

**No template cloning.** `mini` clones a row from one parsed `<tr>`, so *create*
pays one `cloneNode` instead of a dozen `createElement`s. There is no equivalent
on a native target: an engine has no HTML parser and no way to deep-copy a
subtree. A row is built element by element, and the create columns above show
exactly what that costs.

**No event delegation.** `mini` puts one `click` listener on the `<tbody>` and
recovers the row with `closest`. Native targets have no bubbling phase — which is
why `Host.addEventListener` has neither delegation nor listener options — so
every row carries its own handlers. A thousand rows really is two thousand
listeners here, and pretending otherwise would mean measuring something no app
could ship.

The two that do carry over:

| Technique | Where | Moves the column |
|:--|:--|:--|
| **Keyed `list`** | `list(body, rows, …)` | *swap* (2 inserts), *remove* (0), *append* (untouched prefix) — the move-minimal two-ended diff |
| **O(1) select** | `setSelected` | *select row* — a signal **per row**, so selecting writes two signals rather than making a thousand rows re-read a shared `selectedId` |

`mini` does the select imperatively with `classList`. A signal each is the same
complexity and stays inside the graph, which is the shape this runtime prefers —
there is no imperative "set this prop once" API here, and adding one to win a
benchmark column would have been the wrong trade.

## Running it

The implementation and its behaviour are covered by `main.test.tsx`, against the
memory host — no browser involved, which is the same reason the rest of this
package's suite runs that way:

```bash
bun run --filter='@amritk/mini-native' test   # includes this example's test
```

To run the page in a browser, serve it from this directory with a bundler that
resolves the workspace:

```bash
npx vite
```

`index.html` mounts `bootstrap.ts`, which installs the DOM host and mounts the
**same** app the headless harness times. The only difference between the two runs
is which host is installed — as close as this package gets to a controlled
experiment on what a platform costs.
