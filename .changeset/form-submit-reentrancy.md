---
'@amritk/mini': patch
'@amritk/mini-lynx': patch
---

`handleSubmit` now ignores a second submit while the first is still in flight.

`isSubmitting` was tracked but never consulted, so two taps ran `onSubmit`
twice. The documented `disabled={form.isSubmitting}` covers a double-click on
that one button, but `handleSubmit` is also wired straight to a confirm key and
called by hand — and on Lynx there is no form element and no platform
`disabled` at all, so a `bindtap` had nothing between a second tap and a second
`onSubmit`. That is where an order gets placed. The guard lifts as soon as the
first submit settles, so a form stays usable after a failed save.
