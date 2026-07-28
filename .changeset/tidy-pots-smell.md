---
---

Make both playgrounds work on a phone. `playground-mini-lynx`'s page element now
takes the screen's height in the browser preview, so the app scrolls instead of
running off the bottom of its frame, and rows wrap rather than clipping their
controls at the edge. `playground-mini` is now written small-screen first: the
sidebar becomes a drawer behind a top bar below 760px, readouts scroll instead
of losing their alignment to wrapping, and controls take a touch-sized target.

Playgrounds only — no published package changed.
