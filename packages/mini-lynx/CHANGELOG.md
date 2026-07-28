# @amritk/mini-lynx

## 0.2.0

### Minor Changes

- d165e3e: Close the four _Known gaps_: `<list>` recycling, UI methods, gesture composition, and reduced motion.

  The first three share a shape, and it is why they were the ones left. Everything else the engine can do is an attribute or an event, so the runtime binds a signal to it and the ceiling is the engine's. These are the places where the engine calls **you**, or where a capability is an action rather than a piece of state — so there is nothing for a signal to bind to and they needed real code here.

  - **`/recycle`** — `recycle()` drives `__CreateList`'s recycling callbacks, so a long collection realises a bounded number of elements instead of all of them. Ten thousand rows, a dozen cells. This is the piece the README called the largest outstanding, and it fits a signals runtime unusually well: every other framework has to _rebuild_ a recycled cell — ReactLynx hydrates the pooled element tree against the new row's virtual output, a diff per reuse per scroll frame — whereas here a cell owns an `item` signal and its original bindings are still attached, so reusing it for row 5,000 is one signal write that mutates exactly the attributes that changed. `cell` therefore receives **getters**, not values: a cell outlives the row it was built for.
  - **`/elements`** — `querySelector`, `querySelectorAll` and `invoke`. `scrollTo`, `boundingClientRect`, `scrollIntoView` and `setFocus` are invoked rather than set. `invoke` turns the engine's `{ code }` convention (zero means success) into a promise, once, instead of at every call site.
  - **`/gestures`** — `setGestureDetector`, and the `waitFor` / `simultaneous` / `continueWith` relations. Ordinary events already recognise a gesture; what they cannot express is arbitration — a tap that must lose to a pan already under way. Callback names pass straight through to the engine rather than being enumerated here, on the same reasoning as attributes and events.
  - **`reducedMotion()` / `setReducedMotion()`** on the `.` entry. `RouteStack` consults the preference above the transition seam and skips the animation, so a transition never checks and the behaviour covers transitions this package never saw. The runtime cannot read the value itself — there is no reduced-motion field on `SystemInfo`, and Lynx has no media queries, so no `prefers-reduced-motion` either — so the host app passes it in the way it passes colour scheme. That is one line at startup rather than a prop threaded through every animated component, which was the whole of what the Lynx rewrite lost.

  The engine boundary grows to match: `__CreateList`, `__UpdateListCallbacks`, `__QuerySelector`, `__QuerySelectorAll`, `__InvokeUIMethod`, `__SetGestureDetector`, `__RemoveGestureDetector`, `__GetTag` and `__GetAttributeByName`. All are optional, so a partial engine still satisfies the type and the runtime degrades with a stated warning rather than silently.

  `createFakeEngine` implements every one of them, because it is the reference implementation the whole suite runs against. It gains `enterListItemAtIndex` and `leaveListItem` — deliberately named after the pair in Lynx's own testing-library — so a recycler is driven through the same sequence a device uses; `onInvoke` for stubbing a UI method, since a fake that lays nothing out cannot honestly answer `boundingClientRect`; and `dispatchGesture`, which goes through the real `runWorklet` indirection. Its selector matcher covers tag, id, class, compounds and the descendant combinator and **throws** on anything else, because "nothing matched" and "not implemented" are indistinguishable in exactly the way that lets a test assert the opposite of the device. `__FlushElementTree` now records its arguments, so the `{ triggerLayout, operationID, elementID, listID }` a list cell is committed with is asserted rather than assumed.

  > **A third thing to prototype on a device.** `/recycle`'s protocol is mirrored from ReactLynx's implementation and exercised off-device through the fake, but what a fake cannot tell you is whether the engine agrees about layout. It now sits alongside the worklet event tokens in the README's _Before you ship_ — and `/gestures` callbacks go through that same worklet path, so one device session settles all three.

- 9760bfd: Close the gaps between "the tests pass" and "an app can ship this": errors after
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
    is the deliberate part: there is nowhere useful to throw _to_.
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

## 0.1.0

### Minor Changes

- fd6729c: First release of `@amritk/mini-lynx`: a signals runtime **for Lynx**, driving
  Lynx's Element PAPI directly, with no virtual tree.

  The package used to own a platform-neutral vocabulary, a `Host` contract and
  three implementations of it, so a component could run on a device and in a
  browser. **Lynx already does that** — iOS, Android, Harmony and the web are its
  problem, one layer down, solved with an engine rather than a mapping table. The
  abstraction paid for cross-platform twice and got the worse of both deals: a
  vocabulary that could express a fraction of what the engine could, and a preview
  target allowed to disagree with the device. What was load-bearing survives: real
  elements created once and mutated forever by signals — worth more on Lynx than
  on the web, because the element tree lives on the main thread and every property
  write is a real mutation.

  **Gone:** `Host`/`setHost`, the DOM, memory and Lynx hosts, `elements.ts`,
  `/platform`, and every attribute and event mapping table.

  **New:** `setEngine`/`globalEngine` over `LynxElementApi`; `renderPage` for the
  entry contract the engine expects; JSX typings for all 34 Lynx tags derived from
  `@lynx-js/types` (a types-only optional peer, so the vocabulary tracks the engine
  version an app pins rather than this package's releases); `@amritk/mini-lynx/testing`,
  a complete in-memory Element PAPI the whole suite runs against; and `<list>`,
  `<textarea>`, `<svg>`, real CSS, event capture and interception, and everything
  else the old vocabulary could not name. `/router` keeps the navigation stack
  (`RouteStack`, `StackTransition`) and `createRouter`'s batched `depth` signal,
  now ported to the engine, with `matchRoute`, `parseQuery` and `schemaToValidator`
  coming from `@amritk/mini-helpers`.

  Three findings shaped the implementation, all silent failures on a device and
  none visible from a browser:

  - **An event listener cannot be a closure.** `__AddEvent` takes a handler name or
    a worklet handle; a function is stored and never invoked on the fiber
    architecture. The runtime registers a token and installs the `runWorklet`
    global the engine calls, which keeps it compilerless. That token round-trip is
    verified against the fake engine but **not yet on a physical device**.
  - **`__CreateElement('view', …)` does not create a view.** Per-tag creators are
    mandatory for the tags that have one.
  - **`parentComponentUniqueId: 0` is out of range**, and silently disables class,
    id and tag selector resolution — the tree renders and every stylesheet rule
    misses.

  The reasoning, the trade-offs and what this closes off are in
  `docs/mini-lynx-runtime.md`; `AI.md` and the README carry the current _Known
  gaps_ (`<list>` does not recycle, no `SelectorQuery` wrapper, gesture composition
  is not exposed, the background thread is the app's, reduced motion is not read
  for you), and CI now regenerates `llms.txt`/`llms-full.txt` and fails on a diff.

### Patch Changes

- Updated dependencies [fd6729c]
  - @amritk/mini-helpers@0.1.0
