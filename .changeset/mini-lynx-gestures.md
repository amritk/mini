---
'@amritk/mini-lynx': minor
---

Add the pointer stream and the gesture recognisers on a new `@amritk/mini-lynx/gestures` subpath.

The design is two layers, and the split is what makes gestures portable at all rather than being a per-target maintenance problem.

**The host normalises.** A browser's Pointer Events and an engine's touch events become one `PointerEvent` — an id, a position in the element's own box, and a phase of `down` / `move` / `up` / `cancel`. That is the only part that cannot be written once, and it needed no new host method: `addEventListener` already existed, so the contract grew by nothing. `onPointer` is one prop for all four phases, because a gesture is a sequence and four props would only mean reassembling it at every call site.

**The recognisers are arithmetic.** `pan` and `swipe` know nothing about any platform — they are subtraction and a threshold over a stream that has already been reconciled — which is why they are portable by construction rather than by anyone maintaining two versions. `swipe` is built on `pan`, and the boundary test asserts that neither can reach a host: if one did, it would mean the normalisation had not really been done and the maths was compensating for a platform.

Two details are worth knowing because they are where this is usually got wrong. **A cancel is not an end**: it is the target taking the gesture away — a scroll container claiming the drag, a call arriving — and a recogniser that treats it as an `up` commits gestures nobody made, so `pan` reports it and `swipe` never fires on one. And **`swipe` gates on velocity as well as distance**, because a slow careful drag across the screen is a pan that happened to be long, and treating it as a flick is how a carousel jumps two pages while somebody is reading.

The DOM host reads the element's box once per gesture rather than once per event. `getBoundingClientRect` forces layout and a `pointermove` fires as fast as the display refreshes, so reading it on every one is how a drag turns janky.

`onHoverIn` and `onHoverOut` arrive alongside, and **never fire on a touch**. A browser synthesises `pointerenter` and `pointerleave` around a tap and the host filters those out: a hover-only affordance is a design bug — content nobody on a phone will ever see — not a platform difference to smooth over, so nothing here synthesises a fake hover.

Pinch and rotate are writable over the same stream (`PointerEvent.id` is what makes multi-touch expressible, since two fingers are two streams) and are deliberately not shipped: their thresholds are worth tuning against a real screen rather than guessed at.
