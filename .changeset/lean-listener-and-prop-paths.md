---
'@amritk/mini-lynx': patch
---

Cut the allocations out of binding an event and applying a prop — the two
things every row of every list does.

`addEvent` kept each element's listeners in a `Map` keyed by a `"type:name"`
string it built on every bind, and held each pair's handlers in a `Set`. Both
are the right shape for the case the module exists for — several handlers
fanned out from one dispatcher — and the wrong shape for the case it spends its
time in, which is one element, one pair, one handler. It now keeps a short
array of pairs and stores a lone handler directly on its registration,
promoting to a `Set` only when a pair genuinely gains a second handler. The
fan-out behaviour is unchanged: handlers stay isolated, dispatch still walks a
copy when there is more than one, and the engine still sees exactly one
dispatcher per pair. Detaching now matches its registration by identity rather
than looking it up again by name, so a stale dispose cannot reach into a fresh
registration that a re-bind put in its place.

`applyProp` built a fresh closure for every prop so `bind` could decide
static-or-reactive from it. The appliers are now shared module-level functions
that take the element and the name as arguments, so a static prop — most props,
on most elements — allocates nothing at all to be applied, and only a getter
pays for the one closure its effect needs. A `show` getter is also read once per
update now instead of twice.

Measured against a host that does nothing, binding and releasing 100,000
listeners went from 145 ms to 62 ms, and applying 200,000 static attributes from
18.9 ms to 2.8 ms. Through `scripts/bench-reconciler.ts`, where about half the
time is the fake engine's own bookkeeping, creating 10,000 rows went from 260 ms
to 185 ms and clearing 1,000 from 5.6 ms to 4.6 ms, with the engine-call counts
unchanged in every case. The core entry grew 166 gzipped bytes for it, and the
budget in `core-size-budget.test.ts` records the trade.
