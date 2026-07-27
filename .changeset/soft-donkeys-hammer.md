---
'@amritk/mini-lynx': minor
---

Extend the theme past text, and make dark mode portable.

`Theme` grows `surface`, `border`, `radius` and `weight`. The first three are
read by nothing in `/ui` on purpose — they are the scale an app builds its own
button and card against, and a theme holding only what the component layer reads
leaves an app hard-coding hex values. `weight` is read: without it a heading
renders at body weight on both targets, since the reset flattens the user
agent's bold `<h1>` and a native engine never had one. `Text` and `Heading` take
a `weight` prop, and `Heading` defaults to the theme's `headingWeight`.

**Breaking:** `defaultTheme` no longer uses the CSS system colours `CanvasText`
and `Canvas`. They gave zero-config dark mode on the web and meant nothing to a
native engine, so the default theme was correct on one target and unpredictable
on the other. It is now an ordinary light palette, paired with a new
`darkTheme`, and `systemTheme()` returns a theme signal that follows
`colorScheme()` — portable, because every host answers it. An app relying on the
system colours should pass `systemTheme()` to `ThemeContext.provide`. The
reset's `--mn-color: CanvasText` fallback is unchanged.

`Text` now always states `fontWeight`, so a style bag compared with `toEqual`
gains one key.
