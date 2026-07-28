---
'@amritk/mini-lynx': minor
---

Close the gaps between "the tests pass" and "an app can ship this": errors after
construction, the one unverified engine assumption, and the platform values an
app cannot reach.

The three share a shape, and it is the shape of everything left on the list —
none of them is a missing feature. Each is a place where **this runtime is the
outermost JavaScript frame**, with native code or the job queue above it, so
there is no caller to hand a problem to and nothing above to notice one.

- **`setErrorHandler`.** `ErrorBoundary` covers construction, which is all a
  component can throw during; it runs once and is finished. Everything after
  that ran unguarded into a frame with no contract — a handler throwing inside
  the engine's own dispatch is undefined behaviour that ranges from the rest of
  the frame's listeners being skipped to the app going down, and a commit
  throwing on the promise job queue is an unhandled rejection Lynx's main-thread
  context has nobody listening for. Both are now caught and reported, with the
  source (`'render' | 'event' | 'gesture' | 'commit' | 'lifecycle'`) attached,
  because "something threw" and "the commit threw" lead to different
  investigations. Handlers on one `(type, name)` are isolated from each other,
  since a component and a `ref` did not choose to share a dispatcher; a failed
  commit does not wedge the scheduler, so the next mutation recovers the screen;
  and `/recycle`'s `componentAtIndex` answers the engine's own `-1` rather than
  unwinding into list layout mid-scroll. With no handler installed it warns, so
  a mistake is visible in development with no setup. It does not rethrow, which
  is the deliberate part: there is nowhere useful to throw *to*.
- **`setEventTransport`, and `/bridge`.** Event delivery is the one assumption
  in this package a device could still disprove — the engine hands back a token
  this framework made, and that it does so untouched is read from the engine's
  source rather than confirmed on hardware. The failure would be total and
  silent: the tree renders, nothing responds to touch. So the listener form is
  now a seam with the worklet transport as its default, and `@amritk/mini-lynx/bridge`
  ships the fallback the design note has always named — string handler names,
  with `dispatchNamedEvent` for the app's forwarder to call once the event has
  crossed back from the background thread. A device disagreeing is a startup
  line rather than a fork. The cost is stated where it is chosen: a thread hop,
  and with it the property that a handler runs in the gesture's own frame.
- **`globalProps()`.** Colour scheme, locale, flags and the reduced-motion
  preference arrive from native twice — as `lynx.__globalProps` at startup, and
  thereafter through the engine calling a global `updateGlobalProps`. An app can
  read the first on its own but cannot usefully own the second: the engine calls
  exactly one function, so a component reacting to a theme change would be
  hoping it was the one that got there. `renderPage` claims the slot and turns
  it into a signal, which also makes the reduced-motion line a one-off rather
  than a subscription the app maintains.

`renderPage` also emits `firstScreen` even when the root component throws. That
event is the platform's cue to stop waiting rather than a report of success, and
a blank screen with a crash report is strictly better than a splash screen that
never dismisses and says nothing.

The core's gzipped budget moves 5064 → 5414 to cover all of it. None of it is
addable from outside the package, and none of it runs on a day when nothing goes
wrong.
