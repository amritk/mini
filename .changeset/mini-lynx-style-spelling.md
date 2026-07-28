---
'@amritk/mini-lynx': patch
---

Fix the Lynx host dropping every camelCase style key, silently and on the device only.

`__SetInlineStyles` and `__AddInlineStyle` are handed CSS **declarations**, which the engine parses as CSS — where `fontSize` has never been a property. Both the style path and the transition animator were passing the key through as written, so a bag of `{ fontSize: 16, backgroundColor: 'red' }` reached the engine as two declarations it could not parse and discarded without complaint. Everything the package ships in that spelling was affected: `defaultTheme`, the whole `/ui` layer, and every example in the docs.

Nothing caught it because nothing could. The DOM host already converted the key before `style.setProperty`, and the memory host stores the bag verbatim and asserts against it — so the browser preview and all 569 tests agreed with each other and disagreed with the only target that mattered. It surfaced when the `/lynx` playground screen began driving the real host against a fake Element PAPI and printing the resulting tree.

The conversion now lives in `hosts/to-css-name.ts` and is shared by both hosts, which is also what stops the two drifting apart again. Note the direction: it is the opposite of `to-keyframe.ts`'s, because a keyframe is a plain object read by property name while a declaration is parsed as CSS. Both spellings stay legal in a style bag, and a custom property (`--brand`) is passed through uncased.

Also exported `LynxElement` and `LynxElementApi` from `@amritk/mini-lynx/hosts/lynx`. `createLynxHost` documents that you may "pass a fake to exercise the adapter off-device", and a fake has to satisfy `LynxElementApi` to be one — which lived on a module outside the export map, so taking up the invitation needed a cast.
