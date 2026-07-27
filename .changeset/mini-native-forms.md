---
'@amritk/mini-native': minor
---

Port forms from `@amritk/mini` to a new `@amritk/mini-native/forms` subpath: `createForm`, `Field`, and JSON Schema validation.

Almost all of it ported unchanged, and that is the observation worth keeping. A form is state, and state has no platform: values are signals, the aggregate state is `computed`, and gating an error message on touched-or-submitted is arithmetic over booleans. None of it knows what it is rendering to.

**One thing had to be rewritten: how a control is wired to a field.** The web version inspects the element it is handed — `instanceof HTMLInputElement`, `element.type === 'checkbox'`, `HTMLSelectElement` — and picks a binding from what it finds. A host node here is opaque by design, precisely so the same form code runs against a browser, an engine, and a headless tree. So the type of the field's **initial value** decides instead: `''` binds text, `0` binds a coerced number, `false` binds a toggle.

That is the better end of the trade rather than a concession. `initialValues` already says what each field is, in one place, before any element exists — and the web version's own documentation already described the behaviour that way ("a field's type is whatever its `initialValues` entry is") while its implementation derived it from the DOM and could therefore disagree. Here they cannot.

`Field` is the other adjustment, and only because the vocabulary is smaller than HTML. There is no `as="select"`: a picker is a platform-owned surface — a wheel, a sheet, a dropdown — rather than something five tags can name honestly, so it is left out instead of approximated by something that looks right in a browser and wrong on a device. `as="textarea"` becomes the `multiline` flag the vocabulary already has.

Two accessibility details are handled rather than left to the caller. `label` is one prop for both the visible text and the control's accessible name, because a native tree has no `<label for>` association to make and two props would let a field show one word and announce another. And the error message is put on the control's `hint` as well as rendered, since text sitting near a field with nothing tying the two together is how an error reaches a sighted user and nobody else.

The numeric binding keeps the web version's `NaN`-means-blank behaviour, which matters more than it looks: `Number('')` is `0`, so without it a cleared field reads back as a deliberate zero and snaps straight to it, and a `required` check has no way to tell "left blank" from "genuinely zero".

Schema validation runs through `@amritk/runtime-validators`, now an optional peer of this package too — install it only if you validate with schemas.
