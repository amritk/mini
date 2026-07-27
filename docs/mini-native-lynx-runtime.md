# mini-native as a Lynx runtime

This note records why `@amritk/mini-native` stopped being a multi-platform UI
runtime with its own vocabulary and became a thin signals layer over Lynx, and
what that cost and bought. It replaces the position taken in
[`mini-native-cross-platform.md`](./mini-native-cross-platform.md), which is
kept because the reasoning there is still correct — it was answering a different
question.

---

## 1. The argument in one paragraph

The package used to own a five-tag platform-neutral vocabulary (`view`, `text`,
`image`, `scroll-view`, `input`), a `Host` contract of about fifteen functions,
and three implementations of it. The point of all that machinery was to write a
component once and run it on a device and in a browser. **Lynx already does
that.** iOS, Android, Harmony and the web are its problem, one layer down, and
it solves them with a real engine rather than with a mapping table. So the
abstraction was paying for cross-platform twice and getting the worse of the two
deals: a vocabulary that could express perhaps a fifth of what the engine could,
and a preview target that was allowed to disagree with the device.

Removing it takes about 5,000 lines out of the package and takes the ceiling off
at the same time.

---

## 2. What was actually load-bearing

Two things, and neither was the vocabulary.

**Real nodes, created once, mutated forever by signals.** No virtual tree, no
diff, no re-render. This is worth *more* on Lynx than on the web: the element
tree lives on the main thread, every property write is a real mutation, and a
runtime that writes only what changed is not optimising — it is the difference
between one attribute write and a subtree commit.

**A platform boundary you can fake.** The old `Host` was injectable so it could
be tested off-device. The Element PAPI is injectable for the same reason, and
better: it is the *real* target's API, so a test against the fake is a test
against the thing that ships. The old memory host tested that the runtime could
drive an abstraction the runtime had itself invented.

Everything else — `/flow`, `/composition`, `/router`, `/forms`, `/query` — never
knew what a platform was and crossed over unchanged.

---

## 3. What was deleted, and what replaced it

| Deleted | Replaced by |
| --- | --- |
| `Host` (~15 functions) + `current-host` | `LynxElementApi` + `current-engine` |
| `hosts/dom` (~1,050 lines) | Lynx for Web, which is the engine's own web target |
| `hosts/memory` (~400 lines) | `testing/create-fake-engine` — the real API, faked |
| `hosts/lynx` + converters + mapping tables | nothing; the runtime writes the engine's own names |
| `elements.ts` — 5 tags, hand-written | `vocabulary/` — 34 tags, derived from `@lynx-js/types` |
| `/ui` — `Text`, `Button`, `Stack`, `Screen`, … | Lynx elements and CSS |
| `/platform` — `colorScheme`, `dimensions`, `safeArea` | `SystemInfo` and `globalProps` |
| `/gestures` — `pan`, `swipe` | the engine's gesture system |
| `/animate` — timelines as inline transitions | CSS `@keyframes`, transitions, `element.animate()` |
| `VirtualFor` — fixed-height windowing | `<list>`, with waterfall, sticky and snap (recycling still to wire) |
| `router/browser` | there is no browser target to have a history for |

The `/ui` row is the one worth dwelling on. That layer existed to keep a
five-tag vocabulary confined to a dozen components, so that changing the
vocabulary would be a rewrite of one directory rather than of the app. With the
engine's own vocabulary there is nothing to confine — and a component layer that
is not hiding a limitation is a design system, which belongs to an app rather
than to a runtime.

---

## 4. The consequence nobody plans for: the runtime is now main-thread

This falls out of the decision rather than being chosen. The Element PAPI is a
main-thread API; a runtime that drives it directly runs on the main thread.

That is mostly a gift. A handler runs in the same frame as the gesture that
triggered it, a signal write reaches the tree with no thread hop, and the
scheduling story is one microtask per tick. It is what `main-thread:bindtap`
buys a ReactLynx app by hand, one handler at a time, applied to everything.

It also has costs that an app has to know about, and they are real:

- **Heavy work in a handler blocks rendering.** There is no background thread
  absorbing it. Anything expensive belongs behind an async boundary.
- **The main-thread context is not the background context.** Do not assume the
  full set of platform globals; check what your engine version injects.
- **`/query` is the sharpest case.** It wants `fetch` and timers. Where those
  live is an engine-version question, and an app that cannot reach them from the
  main thread should own its fetching on the background thread and push results
  in.

---

## 5. Events: the finding that shaped the implementation

This is the part that would have been discovered on a device, expensively, and
it is worth writing down.

`__AddEvent(element, type, name, listener)` looks like it takes a callback. The
published documentation types the parameter as `string | Function`. **It does
not usefully take a function.** The engine's own declaration says
`string | Object | undefined`, and the reason shows up in the dispatch path:

- a **string** listener is a handler NAME, which the engine routes to the
  background thread;
- an **object** of the shape `{ type: 'worklet', value }` is dispatched on the
  main thread;
- a **function** is accepted at bind time, stored in a field that fiber-arch
  dispatch does not read, and then silently never invoked. No error, no warning
  in JavaScript, one line in native logs.

So the naive implementation binds cleanly, renders correctly, and does nothing
when tapped — on device only.

The way through is a detail of the worklet form: **the engine never looks inside
`value`.** It fetches a global named `runWorklet` and calls
`runWorklet(value, [event], options)` — and `runWorklet` is supplied by the
*framework*, not by the engine. ReactLynx puts a compiler-produced handle there
and resolves it against a registry its `'main thread'` transform populates; Vue
Lynx does the same with its own transform. Neither is required. An integer is a
perfectly good token if the thing resolving it is yours.

So `events/worklet-registry.ts` hands out integers and installs the `runWorklet`
that resolves them, and the runtime stays compilerless while handling events on
the main thread. That is the single most load-bearing inference in this change,
and it is worth flagging its status: the engine-side mechanism is read from the
engine's source, but a framework-defined token has not been round-tripped on a
physical device by this package. **Prototype it on a device before shipping
anything that depends on it.** If it fails, the fallback is contained and
already understood — register string handlers and own the receiving end by
assigning `lynxCoreInject.tt.publishEvent`, exactly as ReactLynx does, at the
cost of a thread hop.

The fake engine **throws** on a function listener rather than accepting one,
mirroring `@lynx-js/testing-environment`. A test should fail where a device
would go quiet.

---

## 6. Two more places the engine is not what it looks like

Both were found the same way and both are silent when wrong.

**`__CreateElement('view', …)` does not create a view.** It builds a generic
fiber node for every tag but one, which loses `is_view()` and the layout-only
optimisation, text measurement on a `text`, `src` handling on an `image`, and
virtualisation on a `list`. The dedicated creators (`__CreateView`,
`__CreateText`, …) are mandatory for the tags that have one, not a fast path.
Confusingly, the engine's own web port and several of its tests do use
`__CreateElement` with built-in tags and pass — because on the web every tag is
a custom element and the distinction does not exist. **The web target cannot be
used to validate an assumption about the native one**, which is a good summary
of why the old DOM host was a liability.

**`parentComponentUniqueId: 0` is out of range.** It reads like a "no owning
component" sentinel. Engine ids start well above zero, so an element created
with it drops out of class, id and tag selector resolution: the tree renders,
inline styles work, and every stylesheet rule quietly misses. The runtime
resolves the page's real id once and passes that.

---

## 7. What this costs

Honesty about the trade:

- **The write-once story is gone**, and with it `role`, `platform.select`, the
  dp style bag as a portability device, and the ability to render the same
  component tree into plain objects for a non-Lynx target. If a target appears
  that is not Lynx and not a browser, `Host` was what would have made it cheap.
- **The package inherits Lynx's release cadence.** Every JS-side Lynx package is
  still 0.x on a monthly cadence, and nothing is documented for custom
  frameworks — ReactLynx is the de-facto specification, and reading its source is
  part of maintaining this.
- **The browser preview is no longer free.** It now means implementing the PAPI
  over the DOM, which the playground does in about 400 lines and Lynx itself does
  properly in `@lynx-js/web-platform`. The playground's version is explicitly a
  preview: it cannot show a missing-flush bug, and per §6 it cannot be trusted
  about anything element-creation-specific.
- **`@amritk/mini` is unaffected.** It remains the DOM package, which is the
  other half of why this is the right trade: the web already had a renderer here.
- **Reduced motion is a real regression, not an oversight.** `/animate` read
  `host.environment.reduceMotion` and skipped a non-essential timeline on its
  own, so honouring the preference cost an app nothing. Nothing in the runtime
  can read it now: the preference lives on `SystemInfo` or arrives through
  `globalProps`, both of which are the app's to consult. So it became the app's
  call — pass no `transition` to a `RouteStack`, do not add the animation
  class — and that is worse ergonomics for an accessibility feature, which is
  exactly the kind of thing that quietly stops being done. If one accessor
  earns its way back into this package, it is this one.

---

## 8. What is now possible that was not

Everything the vocabulary could not name: `<list>` with waterfall, sticky
headers and snap (recycling needs the engine's cell callbacks, which this
runtime does not yet implement — see `CREATORS` in `tree.ts`); `<textarea>`, `<svg>`, `<refresh>`, `<viewpager>`,
`<overlay>`, `<blur-view>`, `<webview>`; authored CSS with selectors, variables
and `@keyframes`; grid and Lynx's `linear` and `relative` layout systems; event
capture, bubbling and interception through `catch`; exposure events; the
Performance API; the devtool understanding the tree.

None of it needed a release here. That is the actual test of whether this change
was right: the ceiling moved from "what this package has named" to "what the
engine can do", and those are very different rates of change.
