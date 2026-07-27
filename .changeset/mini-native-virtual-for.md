---
'@amritk/mini-native': minor
---

Add `VirtualFor` to `@amritk/mini-native/flow`: a virtualised list that builds a bounded window of rows and recycles them as the collection scrolls past.

`For` over ten thousand rows creates ten thousand host elements. On the web that is slow; on a device it is ten thousand real views, which is the defining native performance problem and the reason every native toolkit ships a recycler. `VirtualFor` builds `viewport / itemSize + 2 × overscan` elements and no more, whatever the collection's length.

**It is not bound to a platform recycler, and that is the interesting part.** The obvious implementation is a host seam onto each engine's own recycling list, and it was rejected twice over. A recycler's programming model is "the engine owns the cell, you fill it with data" — a different contract from the rest of this package, and one that would have to be approximated on every target that has no recycler.

It is also unnecessary, because this runtime already has the recycler's model. `Index` hands a row a getter for whatever currently occupies its slot; a recycled cell is a node that stays put while the data flowing through it changes. Those are the same idea, and the second is already how everything here works. So the window is built out of the ordinary keyed `list` — **keyed by slot, not by item** — and scrolling moves data through slots without touching a node. Keying by item would rebuild every visible row on every scroll, since all the keys would have changed, which is exactly the cost being avoided.

The result needs no new host method, behaves identically on all three targets, and is testable against the memory host where no engine exists at all.

Both arguments to the row builder are getters, and that is load-bearing rather than a convenience: reading `item()` inside a binding is what makes a slot update in place instead of being rebuilt.

```tsx
<VirtualFor each={rows} itemSize={64} viewport={() => dimensions()().height} role="list">
  {(row) => <view role="listitem"><text>{() => row().label}</text></view>}
</VirtualFor>
```

`itemSize` is fixed, which is the known limitation and is stated rather than worked around. Rows of differing sizes need each row measured before it is on screen, which needs a `measure` on the host contract that does not exist; estimating instead is how a virtualised list ends up jumping under the user's finger as the estimates are corrected. A wrong fixed number is at least wrong visibly — rows overlap or leave gaps — rather than as scroll drift on somebody's slower phone.

`axis="horizontal"` covers carousels. `viewport` is reactive so a rotation grows the window rather than leaving the bottom of the screen empty. The runway carries the extent the whole collection would occupy, so the scrollbar and the fling physics describe the real list rather than a screenful.
