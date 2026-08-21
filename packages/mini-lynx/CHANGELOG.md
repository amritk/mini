# @amritk/mini-lynx

## 0.4.1

### Patch Changes

- 384672c: `handleSubmit` now ignores a second submit while the first is still in flight.

  `isSubmitting` was tracked but never consulted, so two taps ran `onSubmit`
  twice. The documented `disabled={form.isSubmitting}` covers a double-click on
  that one button, but `handleSubmit` is also wired straight to a confirm key and
  called by hand — and on Lynx there is no form element and no platform
  `disabled` at all, so a `bindtap` had nothing between a second tap and a second
  `onSubmit`. That is where an order gets placed. The guard lifts as soon as the
  first submit settles, so a form stays usable after a failed save.

- 03b0f61: Cut the allocations out of binding an event and applying a prop — the two
  things every row of every list does.

  `addEvent` kept each element's listeners in a `Map` keyed by a `"type:name"`
  string it built on every bind, and held each pair's handlers in a `Set`. Both
  are the right shape for the case the module exists for — several handlers
  fanned out from one dispatcher — and the wrong shape for the case it spends its
  time in, which is one element, one pair, one handler. It now keeps a short
  array of pairs and stores a lone handler directly on its registration,
  promoting to a `Set` only when a pair genuinely gains a second handler. The
  fan-out behaviour is unchanged: handlers stay isolated, dispatch still walks a
  copy when there is more than one, and the engine still sees exactly one
  dispatcher per pair. Detaching now matches its registration by identity rather
  than looking it up again by name, so a stale dispose cannot reach into a fresh
  registration that a re-bind put in its place.

  `applyProp` built a fresh closure for every prop so `bind` could decide
  static-or-reactive from it. The appliers are now shared module-level functions
  that take the element and the name as arguments, so a static prop — most props,
  on most elements — allocates nothing at all to be applied, and only a getter
  pays for the one closure its effect needs. A `show` getter is also read once per
  update now instead of twice.

  Measured against a host that does nothing, binding and releasing 100,000
  listeners went from 145 ms to 62 ms, and applying 200,000 static attributes from
  18.9 ms to 2.8 ms. Through `scripts/bench-reconciler.ts`, where about half the
  time is the fake engine's own bookkeeping, creating 10,000 rows went from 260 ms
  to 185 ms and clearing 1,000 from 5.6 ms to 4.6 ms, with the engine-call counts
  unchanged in every case. The core entry grew 166 gzipped bytes for it, and the
  budget in `core-size-budget.test.ts` records the trade.

- 1197d3f: Close an inline-handler injection in the JSX runtime, and say something when a
  recycling list's keys collide.

  `@amritk/mini` no longer writes an `on…` prop through as an attribute when its
  value is not a function. `setAttribute('onclick', someString)` installs an
  inline handler — script the browser compiles and runs — and the ordinary way a
  string got there was a `{...props}` spread carrying data nobody audited. That
  was markup injection on a path `grep bindHtml` does not find, which is the grep
  this package's whole XSS story rests on. The name is tested against the element,
  so a custom attribute that merely starts with those two letters (`once`,
  `online`) is untouched, and a function-valued handler still binds through
  `addEventListener` exactly as before.

  `@amritk/mini-lynx`'s `recycle` now warns when two rows share an `itemKey`. The
  inventory diff is keyed, so a repeat made it describe a list nobody has: the map
  keeps only the last index for a duplicated key, and every earlier row then
  reports as having moved from it — on an update that changed nothing. Both
  `list()` implementations already warn on a key collision; this is the same
  mistake with a symptom much harder to trace back.

## 0.4.0

### Minor Changes

- 59983c4: Add `@amritk/mini-lynx/keyboard` — the soft keyboard as a signal, and the
  layouts that move out of its way.

  Lynx does not avoid the keyboard for you. `<input>` does not do it, the docs say
  so outright, and what the engine offers is a single global event —
  `keyboardstatuschanged`, carrying `'on' | 'off'` and a height. Every Lynx app
  with a form writes the layout on top of that event, and the three mistakes are
  always the same: lifting by the whole keyboard rather than by the overlap,
  adding the bottom safe-area inset on top of a keyboard that already covers it,
  and clearing on `blur` — which makes the screen flinch when focus moves between
  two adjacent fields.

  The wiring is two lines and no provider:

  ```tsx
  trackKeyboard() // once, next to setEngine

  <KeyboardAvoiding>
    <input ref={avoidKeyboard} placeholder="email" />
    <input ref={avoidKeyboard} type="password" />
  </KeyboardAvoiding>
  ```

  `ref` is this runtime's element-extension seam, so a control reports its own
  focus and the container reads it — nothing is threaded between them.

  - **`trackKeyboard(options?)`** subscribes to the engine's `GlobalEventEmitter`
    and feeds `keyboardHeight()`. The emitter is an option because Lynx's own
    compatibility data lists `keyboardstatuschanged` as **unsupported on the web**:
    a DOM build reports the keyboard from `visualViewport` and passes it in, and
    everything downstream is the same code.
  - **`keyboardLift({ inset, offset })`** is `max(0, height - inset) + offset`
    while open and exactly zero while closed — the offset included, because a gap
    above a keyboard that is not there is a hole in the layout.
  - **`keepAboveKeyboard()`** measures the focused field against a bounds element
    and answers how far a container has to rise, feeding the rise already applied
    back into the next measurement so moving between fields cannot drop the
    container back to rest. Both rects come from one coordinate space, so nothing
    here needs pixel ratios or a status-bar height — which is the part `lynx-ui`
    pays for with an `androidStatusBarPlusBottomBarHeight` prop.
  - **`<KeyboardAvoiding>`** is that wired to a style binding, with
    `behavior='translate'` (rise by the measured overlap) or `'padding'` (reserve
    the keyboard's height for a scroller). It writes only the declaration it owns
    and imposes no layout of its own, and it honours `reducedMotion()` the way
    `RouteStack` does.

  `/keyboard` is opt-in and its own module graph, reaching sideways into exactly
  one file — `elements/invoke.ts`, for the rect — which `import-boundary.test.ts`
  now pins as an exact list.

  The playground gains a `/keyboard` screen, a `visualViewport` emitter, and
  `__InvokeUIMethod` on its DOM Element PAPI (`boundingClientRect` and
  `scrollIntoView` answered honestly, everything else reported as unimplemented
  rather than invented).

  **Not verified on a device.** The arithmetic and the components are covered
  against the fake engine, but the engine event itself, the units it reports, and
  how a real IME animation interacts with the transition are unconfirmed on
  hardware.

- ab6476a: Type route params from the pattern, and give `@amritk/mini-lynx` a browser
  history again.

  **The pattern is now read at the type level.** `PathParams<'/users/:id'>` is
  `{ id: string }`, and `matchRoute` is generic over its pattern, so
  `matchRoute('/users/:id', path)` hands back `{ id: string } | null` instead of a
  record that answers `string` for every key including the misspelt ones. It lives
  in `@amritk/mini-helpers` beside the matcher it mirrors, because the grammar has
  to be one definition or the value and type worlds drift; `path-params.test.ts`
  pins the two together, down to `/v:major` being a literal segment on both sides.

  `PathParams<string>` is `RouteParams`, so this is additive: a table annotated
  `Route[]`, or built at runtime, compiles exactly as before and gets exactly what
  it got before.

  **`buildPath` is the inverse.** `buildPath('/users/:id', { id })` cannot spell
  the pattern wrong, forget a param or be left behind when a route is renamed, and
  its values are encoded to round-trip back through `matchRoute`. A `*` wildcard
  is encoded per segment, because `rest` is a path and its slashes are structure.
  `navigate` still takes a plain string, deliberately — a router navigates to
  concrete paths, and one that matches nothing is what a fallback screen is for —
  so the check sits where the string is assembled instead.

  **`@amritk/mini-lynx/router` gains `route()` and `AnyRoute`.**
  `route('/users/:id', (params) => …, meta)` keeps the pattern's literal type
  alive so the view is handed a `() => { id: string }`. Its three arguments are
  not a style choice: folded into one object literal, the pattern and the metadata
  compete for inference against an intersection, and the metadata loses — a tab
  bar reading `route.label` would get `unknown` back.

  `Route` is now `Route<P extends string = string>`, and the router's generics are
  constrained by the new `AnyRoute`. `Route<'/users/:id'>` is deliberately not
  assignable to `Route<string>` — its `view` demands the narrow getter, and the
  widened form can only promise the flat record — so a table of mixed patterns
  needs a constraint that admits all of them. `render-route.ts` owns the single
  cast that reconciles the two. Existing tables keep working: `Route` with no type
  argument is what it always was.

  **`createBrowserHistory` is back, on `@amritk/mini-lynx/router/browser`.** It is
  a `RouterHistory` and nothing else, because the rest of routing is already
  target-free — a device build swaps `createMemoryHistory()` back in and changes
  nothing else. It takes a `base` prefix, and it stamps its depth into
  `history.state` rather than reading `window.history.length`, which counts the
  whole tab and is wrong in both directions once the user has gone back. That
  stamp is what survives the two things a memory stack never faces: a reload
  mid-stack and a forward button.

  It is the only module in the package that names `window`, and it is quarantined
  accordingly. `src/router/browser/` is excluded from the main compiler pass and
  covered by `tsconfig.dom.json`, so the platform-free rule the rest of the
  package keeps stays something the compiler enforces rather than a convention.
  Hash mode is not included: configuring a host for an SPA fallback is one line,
  where a second URL grammar would be one the device build can never use.

  **`stripBase` moved into `@amritk/mini-helpers`,** since both routers now read a
  browser pathname and a base that meant something slightly different on each side
  is exactly the drift that package exists to prevent. `@amritk/mini`'s router
  surface is unchanged apart from re-exporting `buildPath` and `PathParams`.

### Patch Changes

- 1b6c33d: Bring every package's shipped `AI.md` back in line with what that package
  actually publishes, and add `bun run check:ai-docs` so it cannot drift again.

  The files had gone stale in the way generated-and-committed docs always do —
  silently, and only for the audience that cannot file an issue about it.
  `@amritk/mini` never documented `watch`, `template`, the typed `matchRoute` /
  `buildPath` re-exports on `/router`, `Field` on `/forms`, or the `/vite` subpath
  at all; `@amritk/mini-lynx` was missing `computed` / `effectScope`,
  `fadeTransition`, `keepAboveKeyboard` and `HANDLER_PREFIX`;
  `@amritk/lynx-notifications` documented neither its `/testing` subpath nor the
  fake behind it. All four native packages exported `MODULE` and `EVENTS` with no
  mention of what they are for, and only `@amritk/lynx-dialogs` showed how to wire
  a fake into `installNativeBridge` — which is the one thing a consumer testing
  its own screens needs.

  Two accuracy fixes matter more than the additions. Every native package's
  _Status_ section claimed the Objective-C compiles against the real Lynx pod; the
  macOS CI job was disabled on cost, so it now compiles only when somebody runs
  `pod lib lint` by hand, and the docs say that. And `@amritk/lynx-dialogs` never
  carried a _Status_ section at all, so nothing in it told a reader that none of
  it has run on a device.

  `bun run check:ai-docs` reads each package's `exports` and fails on a runtime
  export, a published subpath, or (for a package shipping native sources) a
  _Status_ section its `AI.md` never mentions. It runs early in CI, before the
  build. Exports no consumer ever writes — the tree operations the JSX transform
  calls, and the like — are listed in `INTERNAL_EXPORTS` with the reason.

- d11610b: Cut main-thread work out of the paths every screen runs.

  This runtime is main-thread because the Element PAPI is, so the work it does
  building and updating a tree is not work a background thread can absorb — it is
  work the frame has to fit around. Five changes, all in the hot paths, none of
  them changing an API:

  - `jsx-runtime.ts` walks props with `for…in` instead of `Object.entries`, which
    was allocating an array plus a pair per prop, per element. It was the single
    hottest function in a CPU profile of building a thousand-row list.
  - `apply-prop.ts` remembers the event-prefix parse per prop name. Every prop
    used to pay up to six `startsWith` scans on its way to `__SetAttribute`; a
    given spelling is now scanned once for the life of the app.
  - `style/to-css-name.ts` and `style/to-style-text.ts` do the same for the CSS
    spelling of a style key and the unitless verdict on it. Both ran a regex per
    key per write, which for a reactive style bag — `style={() => ({ paddingBottom:
keyboardHeight() })}` — meant rediscovering the same answers every frame.
  - `add-event.ts` no longer copies a handler set of one on every delivered event,
    and builds that set empty rather than from an iterable it had to allocate. The
    dispatcher runs on every frame of a scroll, where its garbage competes with
    the layout it is scrolling.
  - `resolve-class.ts` collects into one accumulator instead of
    `map`/`filter`/`join`, which allocated three arrays per array level and four
    per toggle map to produce one string. A reactive `class` is the binding an app
    re-runs most.

  Measured against an engine that does nothing but keep the tree — so the number
  is the runtime's own cost and not a host's — building a thousand rows went from
  ~9.5ms to ~7ms, about a quarter.

  Separately, `testing/create-fake-engine.ts` trims its call log in batches
  instead of on every call. It was doing `calls.slice(-1000)` per PAPI call once
  past the first thousand, so a suite that builds a thousand rows paid twenty-five
  million array writes for a log it keeps a thousand lines of — which also meant
  the package's own reconciler benchmark was mostly measuring the fake. `calls()`
  slices on the way out, so the window a caller sees is unchanged. End to end that
  takes `create 10,000 rows` in `bun run bench:reconciler` from ~840ms to ~170ms,
  and `create 1,000 rows` from ~105ms to ~20ms, with the engine-call counts
  identical.

  The core's gzipped byte budget moves 5449 → 5559 to pay for the lookup tables.
  See the note in `core-size-budget.test.ts` for the reasoning; it is the third
  deliberate move.

- Updated dependencies [ab6476a]
  - @amritk/mini-helpers@0.2.0

## 0.3.0

### Minor Changes

- c8bab7e: Accept `text-maxline` as `number | string`. The shipped `@lynx-js/types` declare the attribute a `string` while the docs' code block declares `number`, and following the types verbatim made `text-maxline={2}` a compile error with `"2"` as the workaround. The vocabulary now takes both forms, and the runtime stringifies a number just before `__SetAttribute`, so the engine still receives exactly the string the shipped types promise — from `applyProp` and `bindProp` alike.

  Also fixes the playground's DOM preview reset: a `<text>` nested in a `<text>` now renders `display: inline`, matching the `inline-text` the engine compiles it to, instead of breaking every styled run onto its own line.

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
