---
'@amritk/mini-native': minor
---

Add the component layer on a new `@amritk/mini-native/ui` subpath: `Text`, `Heading`, `Button`, `Link`, `Stack`/`Row`, and `List`/`ListItem`.

The line it draws is the whole design. **The package ships the semantics; the app ships the taste.** `<Button>` knows that a button is a button on both targets, is reachable by keyboard on both, and is *unavailable* rather than merely greyed. It does not know that your buttons are 44px tall with a 6px radius. The first is portable knowledge that is easy to get wrong and invisible when you do; the second is your product's and changes with it.

Two things follow from drawing it there. The layer needs **no host machinery at all** — it is pure composition over the `role` prop the vocabulary already carries, so the `Host` contract grows by nothing. And because none of it has an appearance, every component has an assertable semantic outcome on all three hosts, so they sit in the parity suite beside the vocabulary itself.

The parity suite found something on the first run, which is the argument for the layer in miniature. A `<Button>` states `focusable`, because without it the three hosts all report "nothing was said" — and agree — while a real `<button>` sits in the browser's focus order having been asked nothing and a Lynx view with a button role sits outside it. Both hosts are behaving correctly; the component is what makes them the same.

`<Button>Save</Button>` works even though `<view>Save</view>` still does not compile, and the distinction is deliberate. A container refusing a bare text run is a compile error because there is no correct reading of it — on a device that screen comes up blank. A component is different: it has an opinion about its own contents, its label needs a `text` element on every target anyway, and the wrap is one visible line in one file rather than a node the runtime inserts behind everyone's back.

The reason to write screens in these rather than in tags is that it keeps every decision underneath reversible. Write `<view role="button" focusable label={…}>` across two hundred screens and the vocabulary is load-bearing everywhere; write `<Button>` and it appears in about a dozen components, at which point the role layer, the event payloads, and even the choice of vocabulary can change without a screen being touched.

Three things are deliberately absent, each waiting on something specific rather than on someone getting to it. `size` and `tone` want a type scale resolved against a theme — `Heading` takes `level` and nothing else for now, so an outline depth cannot be chosen by how big the text should look. `Screen` wants safe-area insets, which no host can report yet. And the theme wants context; when it arrives it will be a signal rather than a value, because a component runs exactly once and therefore reads context exactly once.
