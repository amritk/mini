---
'@amritk/mini-native': minor
---

Add the animation seam: `Host.animate`, a new `@amritk/mini-native/animate` subpath, and a `reduceMotion` environment signal.

Driving an animation from signals is about ten lines and the wrong shape — one property write per displayed frame, which on a native target is a bridge crossing per frame, running at whatever rate the JavaScript thread has left over exactly when it has least to spare. So a timeline is described once and handed to the engine.

**The rule that makes it composable: the signal is the state, the animation is only how it gets there.** There is deliberately no `fill`. An animation never leaves a style behind — the element is released to its own style bag when the timeline ends, however it ends — so you write the settled value first and animate from wherever the element used to be. That single rule buys three things at once: reduced motion can be honoured by simply not running the animation, a host with no `animate` is a host with instant transitions rather than a broken app, and a test against the memory host asserts the same final tree the device shows. An animation that owned its end state would break all three.

`animate` is a call rather than a prop, for the same reason `focus` is: an `animating={true}` prop has no honest meaning once the animation has ended and the prop still says `true`.

`finished` resolves with `'finished'` or `'cancelled'` and never rejects. The alternative — the Web Animations API's own choice — makes cleaning up after a cancelled animation require a `catch` that swallows something which is not an error, and forgetting it costs an unhandled rejection for an entirely ordinary outcome.

**Per host.** The DOM host passes the timeline to the Web Animations API, so it runs on the compositor and keeps its frame rate through a busy main thread; it declares `animate` only when the browser actually has the API, which keeps the runtime's skip path exercised on every test run, since happy-dom has no animations at all. The Lynx host builds it from inline CSS transitions — the most the declared Element PAPI can express, and genuinely a lot, since the engine still owns the interpolation — with `options.animate` there for an engine build with something better. What JavaScript keeps there is the sequencing between legs, which is a timer and can drift under load; that is stated rather than papered over. The memory host records the descriptor and leaves the animation running until a test ends it, so "the row faded out and then was removed" is assertable as a sequence rather than as a race.

`reduceMotion` joins `colorScheme`, `dimensions`, and `safeArea` on `/platform`. `animate` honours it without any call site asking, and `{ essential: true }` is the opt-out for the rare motion that carries information rather than polish. It defaults to `false` on a host that cannot tell: defaulting the other way would turn every unteached host into one whose animations silently never run, which reads as a broken framework rather than as a setting being respected.
