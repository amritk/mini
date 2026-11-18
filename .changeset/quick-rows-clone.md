---
'@amritk/mini': minor
---

Faster row creation in `template()` and `list`, plus guidance on long lists.

- `template()` now finds `data-ref` nodes once, when it parses the HTML, and
  each clone just walks to them. It used to run a selector query on every
  clone. Building 10,000 benchmark rows takes about a quarter less script time.
  One edge case changed: when the root and a descendant use the same
  `data-ref` name, the descendant now wins. The rule is now simply that the
  last node in document order wins.
- `list` spots duplicate keys by stamping each row with the pass that claimed
  it, instead of building a `Set` of every key on each update. A row that is
  already on screen now costs one map lookup instead of three hash operations.
- A reactive JSX text child writes its Text node's `data` instead of
  `textContent`, which skips a generic replace-children path.
- JSX accepts an `onScroll` handler.
- The README has a new Performance section: where the time actually goes, a
  recipe for rendering only the visible rows of a long list, and why sharing
  memory with WebAssembly does not help.
