---
'@amritk/mini-native': major
---

Port `/bind`, `/composition`, `/router`, `/forms` and `/query` onto the Lynx
engine, and rework the two places where "the same thing, spelled differently"
was not good enough.

**`createMemoryHistory` is now the router's documented default**, rather than
one of two options, since `@amritk/mini-native/router/browser` went with the
DOM host. That is honest rather than a downgrade: a stack of screens the app
owns outright is what navigation actually is here, so the in-memory stack is the
real implementation and not a stand-in. The `RouterHistory` seam stays, for an
app that is one screen of a larger native shell.

**`RouteLink` is a `<text>` that navigates on tap.** It used to render a real
`<a href>` and then filter out Cmd-, Ctrl-, Shift- and middle-clicks so the
browser could keep them. Lynx has nothing addressable to point at, no default
navigation to prevent, and no modifier keys on a touch, so all of that left with
the DOM host rather than staying behind as defensive code. It carries
`accessibility-traits="link"`, which is now the only thing marking it as a
control. `href` is gone; `label` is new, for a link whose visible text does not
read as a destination.

**`Field` builds real Lynx elements.** `multiline` picks `<textarea>` over
`<input>` — two elements rather than one with a flag — and the control props are
Lynx's own: `type` (replacing `keyboard` and `secure`), `confirm-type`
(replacing `submitLabel`), `maxlength`, `readonly`, `disabled`, and
`bindconfirm` (replacing `onSubmit`). `autoComplete` is dropped, since Lynx has
no autofill hint. The error message is folded into the control's
`accessibility-label` rather than a `hint` prop, because Lynx has no
`aria-describedby` and the accessible name is the only channel that reaches a
screen reader.

**`bindValue` and `bindField` read the typed text off the event.** A Lynx
`<input>` is a real native control, so what the user types never lands back on
the element tree and reading the attribute would only report the last thing the
runtime wrote. The value goes out as the `value` attribute and comes back as
`bindinput`'s `event.detail.value`; the IME guard now follows that event's
`isComposing` flag, since Lynx has no separate composition events. A boolean
field binds to a `checked` attribute and flips on `tap`, because Lynx has no
checkbox element and a toggle is something the app builds out of a `<view>`.

`/query` needed no changes at all.
