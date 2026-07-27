---
'@amritk/mini-lynx': minor
---

Give `/forms`' `Field` the portable half of its styling surface: `style`, `labelStyle`, `inputStyle` and `errorStyle`, alongside the four `*Class` props it already had.

`Field` came over from `@amritk/mini` carrying only the web's channel. A class is a stylesheet lookup on the DOM, a different mechanism again on Lynx, and nothing at all on the memory host — so it was the one component in the package that could not be styled in the way the rest of the package documents as the portable default, and a field in an app that styles with `style` bags had no styling at all.

The four new props mirror the class ones exactly and are equally optional, so nothing changes for a caller already using classes.
