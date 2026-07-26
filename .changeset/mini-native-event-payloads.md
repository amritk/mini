---
'@amritk/mini-native': minor
---

Normalise the payloads of the events the vocabulary names, so a handler can be written once.

`NativeEventMap` entries were all `unknown`, on the reasoning that the package cannot know what an event is and apps should fill it in through declaration merging. That is right for an arbitrary event and wrong for the ones this vocabulary names, because merging picks *one* shape: an app shipping both a web and a device build would have to declare a `MouseEvent` that is a lie on the device, or the reverse. There is no declaration true on both, which is write-once failing at the event boundary no matter how good the semantics layer is.

`tap`, `longpress`, `scroll`, `input`, and `change` now arrive in framework-defined shapes (`TapEvent`, `ScrollEvent`, `InputEvent`) that every host builds from whatever its target handed over — the same job as resolving a `class` array into a string or a bare `100` into `100px`, pointed at the half of the contract that flows back out. So `<scroll-view onScroll={(event) => headerOpacity(event.y)} />` means one thing on both targets.

Tap coordinates are relative to the element's own box, since a viewport-relative point means something different once a native screen has safe-area insets. They are also **optional**: pressing Enter on a focused button, or activating it through assistive technology, is a genuine tap with no position, and reporting `0, 0` would land a ripple in the corner for every keyboard user.

Everything normalising discarded stays reachable on `raw`, deliberately typed `unknown` so that reaching for it costs a cast and reads as the platform-specific code it is. Events the vocabulary does *not* name are passed through untouched, and `NativeEventMap` remains an interface so an app can merge in the events its own host emits.

**Breaking:** handlers for the five named events receive the normalised object rather than the platform event. Reach for `event.raw` where the platform one was wanted.
