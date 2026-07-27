# AGENTS.md — @amritk/mini-native

Contributor guide for AI agents editing **this package**. Repo-wide rules:
[`../../AGENTS.md`](../../AGENTS.md) and [`../../CLAUDE.md`](../../CLAUDE.md).
Consuming the package instead? See [`AI.md`](./AI.md).

A React-Native-shaped UI runtime on `@amritk/mini`'s model: real host nodes
created once, mutated forever by signals, with no virtual tree in between. It
renders to a native view tree, to the DOM, or to plain objects, depending only on
which **host** is installed.

## Commands

```bash
bun run --filter='@amritk/mini-native' test
bun run --filter='@amritk/mini-native' types:check   # runs both passes: DOM-free core, then the DOM host
bun run --filter='@amritk/mini-native' build
```

## Layout

```
src/
  host.ts                 The Host contract — the entire platform surface
  current-host.ts         setHost / requireHost / scheduleFlush (one host per context)
  types.ts                MaybeReactive, ClassValue, StyleValue, opaque node handles
  elements.ts             The element vocabulary (view/text/image/scroll-view/input) + roles
  focus.ts                focus / blur — the only imperative pair in the contract
  context-frame.ts        The ambient frame a lazily-built subtree is rebuilt inside
  events.ts               The event payloads the framework defines, so hosts normalise to them
  jsx-runtime.ts          The compilerless JSX runtime + the JSX type surface
  jsx-dev-runtime.ts      Dev entry point (same implementation)
  apply-prop.ts           One prop → host calls, deciding static-vs-reactive
  append-children.ts      Children, including reactive text nodes
  list.ts                 The only reconciler: keyed list over four host ops
  render-child.ts         Reactive single-slot swap, the base of control flow
  mount.ts                Application root — opens the owning scope
  run-detached.ts         Escape hatch for scope ownership (see the gotcha below)
  untrack.ts              The same suspension, named for the reader's side of it
  watch.ts                Change-only effect with an untracked callback
  signals.ts              alien-signals re-exported (plus batch), so nothing else imports it
  warn.ts                 Recoverable-mistake reporting, without assuming a console
  bind/                   bind-text, bind-prop, bind-show, bind-value
  flow/                   Show, Switch/Match, Dynamic, For, Index, VirtualFor, defaultKey
  ui/                     The component layer — Text, Heading, Button, Link, Stack/Row, List/ListItem, Screen
  platform/               platform.os / platform.select, and the environment accessors
  composition/            createContext, Portal, ErrorBoundary
  gestures/               pan, swipe — arithmetic over the normalised pointer stream
  animate/                animate() — a timeline described once and handed to the engine
  router/                 Pattern matching (pure) + a pluggable history; the browser one is its own entry
  forms/                  createForm, Field, schema validation — ported from mini bar one file
  query/                  createQuery over @tanstack/query-core — ported verbatim
  hosts/
    create-memory-host.ts The reference host — plain objects, no platform
    create-dom-host.ts    Web target (the ONLY file that knows about HTML, with the two below)
    dom-environment.ts    Colour scheme, viewport, safe-area insets, motion preference
    dom-reset.ts          The stylesheet that makes a browser lay out like Yoga
    create-lynx-host.ts   Native target, driving Lynx's Element PAPI
    lynx-element-api.ts   The PAPI subset, as an injectable type
    lynx-transition-animator.ts  Timelines as inline transitions — the most the PAPI can express
    to-style-text.ts      Numbers → the target's unit, shared by the real hosts
    to-keyframe.ts        A style bag → an animation keyframe, units and IDL names applied
    named-events.ts       Which events a host owes a normalised payload for
    tri-state-props.ts    The props where `false` is a value, not an absence
examples/
  js-framework-benchmark/ The keyed benchmark; `bun run bench:reconciler` times it
```

## Invariants — do not break these

- **The core is platform-free, and the compiler enforces it.** `tsconfig.json`
  omits `lib.dom` (and Node's ambient types), so a stray `document`,
  `HTMLElement`, or host global anywhere outside the DOM host fails
  `types:check` rather than quietly working in a browser and breaking on a
  device. `create-dom-host.ts` is excluded there and checked by
  `tsconfig.dom.json` instead; the `types:check` script runs both passes.
- **The element vocabulary is native, not HTML.** `JSX.IntrinsicElements` is
  `view | text | image | scroll-view | input`. Adding an HTML tag inverts the
  whole design — the browser is the *guest* here, a preview target for a native
  app. New vocabulary needs a genuine cross-platform justification.
- **No reconciler beyond `list`.** JSX builds a host node once and signals
  mutate it in place. If a feature seems to need diffing, it belongs in a
  different framework, not here.
- **`Host` stays small** (about 15 functions) — it is the entire porting cost of
  a new platform. `createFlowHost` is separate from `createElement` because the
  right wrapper differs per target; `flush` is optional, for targets that batch.
- **Visibility survives a style write.** `setVisible` and `setStyle` are easiest
  to implement through one channel, and then a wholesale style replacement
  quietly un-hides a hidden element — which is order-dependent on how the props
  happened to be written, so it fails intermittently. Any host sharing a channel
  between the two must remember the visibility and re-assert it. Both real hosts
  do; the memory host keeps them as separate fields, which is why its tests
  could not catch the bug.
- **No raw-markup sink, ever.** There is deliberately no `bindHtml` equivalent
  anywhere in the host contract, so bound data cannot inject elements on any
  target.
- **`false` is a VALUE for the tri-state props, not an absence.** `setProperty`'s
  general rule that `false` means "unset it" erases the very thing `focusable`,
  `selected`, `checked`, `expanded`, and `selectable` exist to express — a
  collapsed disclosure is `aria-expanded="false"`, and no attribute at all is
  something that does not expand. `tri-state-props.ts` holds the set, shared so
  the rule cannot land on one host and not the others. It already did: the
  parity suite caught the DOM host honouring it while Lynx and memory dropped it.
- **A host normalises the payload of every event the vocabulary NAMES**, to the
  shapes in `events.ts` — the same job as resolving a `class` array to a string,
  pointed the other way. Without it `onScroll={(event) => event.y}` cannot be
  written once, because reading an offset would mean knowing which host is
  installed. Anything the vocabulary does not name passes through untouched and
  belongs to whoever installed the host. `NAMED_EVENTS_WITHOUT_DATA` is shared
  between the hosts rather than copied, because three sets that must agree are
  three sets that can drift silently.
- **A wrapper the framework inserted is never visible to accessibility.**
  `createFlowHost` builds the container every control-flow component swaps
  inside, and the moment elements carry roles an interposed generic node breaks
  the parent/child relationships assistive technology walks — `list`/`listitem`
  first, then every richer pairing. Flow wrappers therefore carry
  `role="presentation"`, and `display: contents` alone does NOT count: its
  accessibility-tree treatment has never been consistent enough to bet a
  semantics layer on. The same rule is why a `list` role must not build a real
  `<ul>` — `<ul>` may only contain `<li>`, which is a parse-level content model
  no attribute can rescue once a wrapper sits between them.
- **Anything that builds a subtree LATER must restore the context frame.**
  `renderChild` and `list` capture `currentFrame()` when they are called — which
  is during the component body, inside whatever provider wraps it — and run
  every later build inside `withFrame`. Without that, a theme provided at the
  app root reaches every component except the ones inside a conditional or a
  list, and it fails silently by falling back to a plausible default. Core does
  not know what a frame IS (it is `unknown` there); `/composition` decides the
  shape, which is what keeps the feature out of the byte-budgeted entry. Any new
  lazy-build path — `ErrorBoundary`'s retry was the third — owes the same two
  lines.
- **A bare text run gets its element in a COMPONENT, never in the runtime.**
  `ui/wrap-text-runs.ts` is why `<Button>Save</Button>` works while
  `<view>Save</view>` still does not compile, and the distinction is the whole
  point. A container refusing a text run is a compile error because there is no
  correct reading of it — on Lynx that screen comes up blank. A component is
  different: it has an opinion about its own contents, its label needs a `text`
  element on every target anyway, and the wrap is one visible line in one file.
  `appendChildren` must never grow this behaviour — that is
  [`docs/mini-native-cross-platform.md` §15.3](../../docs/mini-native-cross-platform.md)'s
  rejected option 1, inserting nodes nobody wrote on the target where node count
  is the performance problem.
- **The compiler ceiling here is an OPTIONAL OPTIMISING plugin**, one level above
  `@amritk/mini`'s diagnostics-only ceiling, because this package's consumer owns
  a whole app toolchain rather than embedding into someone else's page. The
  invariant that makes it safe: **an app that skips the plugin still renders
  correctly** — slower, larger, with more wrapper views, but correct. Nothing may
  become a required build step without revisiting
  [`docs/mini-native-cross-platform.md` §18](../../docs/mini-native-cross-platform.md),
  and note that a cross-platform compiler costs double — one plugin per target
  toolchain, kept in lockstep, or the semantics diverge per target.
- This package **ships its `src/`** too (see `files`), so source comments are
  shipped — keep them accurate.

## The alien-signals scope-ownership gotcha

A scope created inside a running `effect` is **disposed when that effect
re-runs**. This bites exactly two places — `list` and `renderChild` — both of
which build long-lived subtrees from inside a tracking effect.

In a keyed list the symptom is nasty because it looks fine: appending one row
would dispose every row already on screen, leaving the nodes in place with the
right text while all of their bindings quietly stopped updating.
`run-detached.ts` is the fix — it builds those subtrees with no reactive owner
installed, handing lifetime back to the code that actually knows when a subtree
should die.

`list.test.tsx` has a regression test named *"keeps existing rows reactive after
another row is appended"* that fails without it.

> `@amritk/mini` had the same latent bug, and a comment in its `render-child.ts`
> asserted the opposite behaviour. Both are fixed there now — it has its own
> `run-detached.ts` — so the two packages agree about how the engine behaves.

## The reserved-`key` gotcha

`key` is reserved by JSX. The transform hoists any `key` attribute out of the
props object into the runtime's third parameter *before the component is ever
called*, so a component with a legitimate prop of that name — `For`, whose `key`
is the row identity function — would never receive it. `jsx` forwards it back
into props for component tags, and `flow/for.test.tsx` pins that. It stays
ignored for element tags, where there is no keying at the JSX level at all.

> `@amritk/mini` had this hole too — its `for.test.tsx` only ever called
> `For({…})` directly, which is likely why nobody noticed. Fixed there as well.

## The two structural suites

`parity.test.tsx` renders one component through all three hosts and compares
what each reports back — role, accessible name, focusability, availability, and
the payload of a tap. It compares SEMANTICS rather than markup on purpose:
asserting markup would only re-test each host's mapping table and would fail
whenever a mapping legitimately changed.

It exists because the failure mode of cross-platform work is silent drift — the
web target keeps working while the device target stops matching, because nobody
runs the second one day to day. It earned its keep on the first run by catching
`focusable={false}` surviving on the DOM host and being erased by the other two,
which is where `tri-state-props.ts` came from.

`vocabulary-coverage.test.tsx` asks whether every prop the vocabulary DOCUMENTS
actually does something, by walking `ElementProps` and asserting no prop reaches
a DOM element as a dead attribute. The audit found four that did — `fit`,
`lines`, `direction`, `multiline` — by reading. The mapped type is the mechanism:
it demands one sample per prop per tag, so adding a prop without adding a sample
fails `types:check` rather than quietly going untested.

Both carry the happy-dom pragma, since comparing against the DOM host needs a
document. That does not weaken the DOM-free guarantee — the memory and Lynx
suites still run in plain node — and both are excluded from `tsconfig.json` and
checked by `tsconfig.dom.json`, exactly like `create-dom-host.test.tsx`.

## Testing

Vitest, per [`../../.claude/testing.md`](../../.claude/testing.md). Every suite
except the DOM host runs against `createMemoryHost` in the default node
environment, where `document` genuinely does not exist — so a stray platform
dependency could not pass unnoticed. `jsx-runtime.test.tsx` asserts that
directly. Only `create-dom-host.test.tsx` carries the
`// @vitest-environment happy-dom` pragma.

The Lynx host takes its PAPI as an argument specifically so
`create-lynx-host.test.tsx` can verify the whole mapping against a fake engine —
no device, no emulator.

## Settled decisions on the cross-platform story

[`docs/mini-native-cross-platform.md`](../../docs/mini-native-cross-platform.md)
is the reasoning. These are the conclusions, so nobody relitigates them from
scratch — each one has a stated trigger for reopening rather than being
permanent.

- **The web is a peer target, not a preview.** `hosts/dom` is expected to produce
  a page you would ship: real semantics, keyboard operability, an accessible
  name. That is a raising of the bar, not a change of direction — the vocabulary
  is still native and the browser is still the guest.
- **The native vocabulary stays; HTML-first was considered and declined.** The
  element half of an HTML-first design is genuinely compilerless (§15), so the
  usual "it needs a compiler" dismissal is wrong. It was declined because the
  subset problem relocates rather than disappearing, HTML's permissiveness cannot
  be honoured natively without inserting nodes nobody wrote, and a `div` that
  does not cascade and defaults to `column` is a false friend. *Reopen if* the
  driving use case becomes migrating an existing web app — at which point
  evaluate React Strict DOM before building anything.
- **Semantics arrive as a `role` prop, not as new tags.** Static, like
  `multiline`, because it decides what the host builds. Keeps the vocabulary at
  five tags and needs no new `Host` methods.
- **`as` accepts a role or a component — never an HTML tag.** A tag is not a
  portable concept, so accepting one would make the override the hole through
  which web-only code re-enters a write-once component. `ContainerProps.as` on
  `For`/`Index` already follows this: same meaning, narrowed to what is coherent
  there.
- **Screens should be written in components, not in vocabulary tags.** This is
  the thing that keeps every decision above reversible: if the vocabulary lives
  in twenty components rather than two hundred screens, changing any of it is a
  rewrite of the component layer instead of the app. `/ui` is that layer.
- **`/ui` ships the semantics; the app ships the taste.** `<Button>` knows a
  button is a button on both targets, is reachable by keyboard on both, and is
  unavailable rather than greyed. It does not know your buttons are 44px tall.
  Two things follow and both are load-bearing: the layer needs **no host
  machinery at all**, so it grows the `Host` contract by nothing, and because it
  has no appearance every component has an assertable semantic outcome on all
  three hosts — which is why they sit in `parity.test.tsx` beside the
  vocabulary. Keep it small: the more it carries, the more a design system built
  on it is version-coupled to this package.
- **Prefer `Host.environment` to `Host.platform`.** Both exist and only one is
  the good answer. An OS name is a proxy for the thing an app actually cares
  about — is there a notch, does hover exist, is anything addressable — and
  proxies rot: `os === 'web'` typechecks forever and is wrong the day a second
  web-shaped target appears. Safe area, viewport, and colour scheme are exactly
  what a name would otherwise be used to infer, so a good environment API is
  what keeps `platform.select` rare. When a branch IS unavoidable, keep it to
  leaf values; anything structural belongs in a `.web.tsx` / `.native.tsx` pair,
  which is greppable and countable where an inline branch is invisible.
- **A capability registry is NOT built, on purpose.** `canHover` /
  `hasBackButton` / `isAddressable` would beat both of the above. Designing the
  flag set before three real call sites exist is guesswork; revisit at three.
- **A host reports only what its target genuinely knows.** Every field of
  `HostEnvironment` is optional and so is the whole object, and the accessors
  fill in a documented static value for whatever is absent — which is also what
  keeps those fallbacks exercised on every run, since the memory host reports
  nothing. The Lynx host takes its environment as an ARGUMENT rather than
  reading engine globals: the PAPI subset it drives is element-level, the
  system-information globals vary by engine version, and there is no fake to
  test them against, so shipping plausible-but-wrong values per build would be
  worse than asking the app, which knows exactly which engine it runs on.

- **Gestures are two layers, and the split is the whole design.** The HOST
  normalises a browser's Pointer Events and an engine's touch events into one
  `PointerEvent` — id, element-relative position, phase. That is the only part
  that cannot be written once, and it needed no new host method. The
  RECOGNISERS in `/gestures` are then pure arithmetic and know no platform at
  all, which is why they are portable by construction rather than by anyone
  maintaining two versions. A recogniser that reaches for a host means the
  normalisation was not actually done and the maths is compensating.
- **Hover never fires on a touch, deliberately.** A browser synthesises
  `pointerenter`/`pointerleave` around a tap and the DOM host filters those out.
  A hover-only affordance is a design bug — content nobody on a phone will see —
  not a platform difference to smooth over, so nothing synthesises a fake hover.
- **`onPointer` is one prop for four phases.** A gesture is a sequence; four
  props would only mean reassembling it at every call site.

## Settled decisions on style

[`docs/mini-native-style.md`](../../docs/mini-native-style.md) is the reasoning.

- **The reset is the floor, not a nicety.** An unstyled container with two
  children stacks vertically on a device and horizontally on the web. Everything
  else in the cross-platform story is additive; this is not, and no amount of
  careful component authoring above it papers over it.
- **The reset never outranks the app.** Every rule is `:where()`-wrapped, so
  specificity is zero and a single class or a `style` prop beats it. A reset that
  wins arguments is one people work around, and the workarounds are worse than
  the divergence.
- **Scoped by `data-mn`, not by tag.** An app embedding this runtime keeps its
  own page. Flow wrappers are deliberately unstamped — `display: contents` means
  no box to reset, and a `display: flex` rule would fight the one thing the
  wrapper must be.
- **Text inheritance stops at a container**, matching Yoga rather than CSS, and
  the base is `--mn-font` / `--mn-color` rather than `initial` — `font: initial`
  is a serif face, so an app that had never heard of the reset would come up in
  Times.
- **Overflow is NOT clipped.** It looks like a missing row in the divergence
  table and is left out on purpose: the two native platforms disagree with each
  other, and clipping every container on the web breaks shadows, focus rings,
  and popovers. *Reopen if* a real screen shows the difference is structural
  rather than cosmetic.
- **Tokens resolve to STYLE OBJECTS, not classes.** Classes are cheaper on the
  web and meaningless on a headless host. A style object is the only shape every
  target already consumes, and class extraction stays available later as a
  web-only optimisation behind the optional plugin — where skipping it costs
  bytes rather than correctness. Choosing classes first would have made the
  other two hosts carry a translation layer that could never be removed.
- **`size` and `level` are two props, always.** Couple them and authors pick
  heading levels by how big they want the text. `Text` has no `role` or `level`
  on its surface at all, which enforces it rather than documenting it.

Still genuinely open, so do not treat it as decided: whether `role="button"`
builds a real `<button>` (browser affordances, but a content model TypeScript
cannot enforce) or a `div` with the role and synthesised activation.

## Known gaps

See the README's *Known gaps* for the full list, which is the one to trust — this
is the short version.

**Everything the audit called the native story has landed.** Accessibility props
(`Role` in `elements.ts` and the two host mappings), the component layer
(`/ui`) and its theme, the platform accessors (`/platform`), the composition
seams (`/composition`), gestures (`/gestures`), routing (`/router`), the
animation seam (`/animate` plus `Host.animate`), the virtualised list
(`VirtualFor` in `/flow`), and the `/forms` and `/query` ports. `docs/mini-native-audit.md`
carries the reasoning behind each and is now a record rather than a plan.

What is genuinely still missing is smaller and mostly waiting on a real screen
rather than on someone getting to it: pinch and rotate (thresholds worth tuning
against a device rather than guessed at), variable row sizes in `VirtualFor`
(needs a `measure` on the host contract), a responsive primitive, and capability
flags. `bindClass` and fragments are deliberate omissions and should stay that
way.

Two rules that keep biting when this list is edited: do not add a prop with
nothing behind it — `vocabulary-coverage.test.tsx` exists to catch exactly that
class of documented lie — and do not describe something as missing here without
checking the README, which is where the reasoning lives.

Add a changeset for every change (`bunx changeset`).
