---
'@amritk/mini-native': patch
---

Fix `swipe` never firing in a browser, by measuring the end velocity across the last movement rather than across the lift.

`pan` computed the velocity it reports at `onEnd` from the displacement between the last movement and the pointer-up event. Every browser fires `pointerup` at the final `pointermove`'s coordinates, so that displacement is zero for an ordinary flick — which made the reported velocity zero, and `swipe`, which gates on velocity, could not recognise a swipe at all. The existing tests missed it because they either set `velocity: 0` or dispatched an up at a displaced position, a sequence no real pointer produces.

`onEnd` now carries the velocity of the last movement when the lift adds no displacement of its own, and only while the lift followed that movement within 80ms. The window is what keeps the case the recogniser was already right about: a drag that crossed the screen and then came to rest before the finger left is a long pan, not a flick, and still reports zero.
