---
'@amritk/mini-native': minor
---

Three vocabulary corrections, all found by asking what each prop means on a device rather than in a browser.

**`scroll-view`'s `direction` is now `axis`.** CSS has already claimed *direction* for text direction — RTL — which is a real cross-platform concern that will want a prop of its own on every element. Two meanings for one prop name is free to fix now and expensive later.

**`keyboard="password"` is now `secure`, a separate prop.** Natively a keyboard mode and text masking are genuinely two settings, and a PIN entry needs both at once: a numeric keypad with masked characters, which was previously unsayable. The web collapses them into `type="password"`, which is exactly why the conflation was invisible. The DOM host now resolves the two into one `type` the way it already resolves `show` and `style` into one `display`, so behaviour no longer depends on which attribute was written first.

**`text` gains `selectable`.** Web text is selectable by default and native text is not, so a component that says nothing behaves differently on each target and neither default is wrong enough to simply pick.

Also fixes a bug the rename introduced and the suite could not see: `createElement` still asked for the old prop name when setting up a `scroll-view`'s default overflow, so a `scroll-view` with no explicit axis stopped scrolling. There is now a test asserting that a scroll container scrolls before anyone sets an axis.
