---
'@amritk/mini-lynx': patch
---

Fix `lineHeight` in a style bag being read as CSS's multiplier instead of as density-independent pixels.

`toStyleText` listed `line-height` among the unitless properties, following the web's local convention. A style bag is supposed to read the same way on every target, and every native toolkit — React Native included — measures line height in dp, so that made one property mean two different things depending on where the app ran.

The shipped `defaultTheme` is the proof, and it is why this is visible immediately rather than subtly: `{ fontSize: 18, lineHeight: 28 }` means a 28dp line on a device and rendered a 504px line on the web, so every `<Text>` and `<Heading>` in a DOM preview came out with enormous leading.

`line-height` now takes the unit like any other length. An app that genuinely wants the ratio can still say so with a string — `lineHeight: '1.5'` — which is the escape hatch every other length already had. `to-style-text.test.ts` is new and covers the whole table.
