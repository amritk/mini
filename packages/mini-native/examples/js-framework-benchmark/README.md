# mini-native — js-framework-benchmark (keyed)

A keyed [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
implementation in [`@amritk/mini-native`](../../README.md), mirroring
[the one `@amritk/mini` grew](../../../mini/examples/js-framework-benchmark). It
is an **example**, not part of the published package.

It exists to answer a question the test suite could not. The keyed list carries a
**move-minimal guarantee**, and in the suite that guarantee is asserted in *engine
calls*: swapping two rows costs one move, removing from the middle costs none.
That proves the algorithm and says nothing about the clock — an O(1) operation is
still slow if the constant is.

## What it measures

Drive `createBenchmarkApp().store` against the **fake engine** from
`@amritk/mini-native/testing`, whose operations are array splices on plain
objects. What is left in the number is very nearly the runtime's own overhead —
building rows, tracking effects, diffing key order — which is the thing this
package can be held responsible for. A figure from a device would be dominated by
that platform's layout and commit costs, which move with the engine build and the
phone, and would say far more about them than about this code.

The **shape** is the durable part, and it is the reconciler's guarantees made
visible: a swap is one move whatever the list's length, a removal is one call, a
clear is one traversal, and selecting a row in a thousand is a single
`__SetClasses`. The create paths scale linearly and are dominated by building six
engine nodes per row, which is the honest cost of a target with no template
cloning.

To measure a real target, drop this into the actual benchmark harness. That is
what it is for, and this is not trying to replace it.

## One of `mini`'s four techniques is unavailable here

That is the interesting part of the mirror, not a shortfall in it.

**No template cloning.** `mini` clones a row from one parsed `<tr>`, so *create*
pays one `cloneNode` instead of a dozen `createElement`s. There is no equivalent
on Lynx: the Element PAPI has no HTML parser and no way to deep-copy a subtree, so
a row is built element by element.

The rest carry over, and one of them carries over *better* than it does on the
web:

| Technique | Where | Moves the column |
|:--|:--|:--|
| **Keyed `list`** | `list(body, rows, …)` | *swap* (1 move), *remove* (0), *append* (untouched prefix) — the move-minimal two-ended diff |
| **O(1) select** | `setSelected` | *select row* — a signal **per row**, so selecting writes two signals rather than making a thousand rows re-read a shared `selectedId` |
| **Main-thread handlers** | `bindtap` | every tap — the handler runs where the element tree lives, so a tap writes a signal and lands on the tree within the frame, with no thread hop |

`mini` does the select imperatively with `classList`. A signal each is the same
complexity and stays inside the graph, which is the shape this runtime prefers —
there is no imperative "set this prop once" API here, and adding one to win a
benchmark column would have been the wrong trade.

Event delegation, which `mini` uses to put one `click` listener on the `<tbody>`,
is not needed and not possible: Lynx keeps one listener per `(type, name)` per
element and this runtime fans out from its own set, so every row carries its own
handlers. A thousand rows really is two thousand listeners here, and pretending
otherwise would mean measuring something no app could ship.

## Running it

The implementation and its behaviour are covered by `main.test.tsx`, against the
fake engine — no device and no emulator, which is the same reason the rest of this
package's suite runs that way:

```bash
bun run --filter='@amritk/mini-native' test   # includes this example's test
```

`bootstrap.ts` is the main-thread entry for running it on a device. It calls
`renderPage`, which is the whole of a Lynx bundle's contract with its main-thread
chunk: the engine calls that global once at startup, the runtime installs the
injected PAPI, mounts into the page element the engine already owns, and emits the
`firstScreen` lifecycle event the platform waits for. Point a Lynx bundler at it
and the same app the headless harness times runs on a phone.

There is deliberately no browser entry. Lynx already renders to the web one layer
down, so a second web target maintained here would be exactly the divergence this
package removed itself to avoid.
