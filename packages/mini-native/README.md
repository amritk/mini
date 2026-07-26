<div align="center">

# @amritk/mini-native

**A React-Native-shaped UI runtime on mini's model: real host nodes created once, mutated forever by signals, with no virtual tree in between.**

![status](https://img.shields.io/badge/status-pre--alpha-ef4444?style=flat-square)&nbsp;
![version](https://img.shields.io/npm/v/@amritk/mini-native?style=flat-square&logo=npm&logoColor=white&label=version&color=6366f1)&nbsp;
![license](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)&nbsp;
![size](https://img.shields.io/badge/deps-1%20(alien--signals)-f97316?style=flat-square)&nbsp;
![vibe coded](https://img.shields.io/badge/vibe-coded-a855f7?style=flat-square)

</div>

---

## Overview

`@amritk/mini-native` renders a component tree to a **native view tree**, the DOM, or plain objects — decided entirely by which **host** is installed. It is [`@amritk/mini`](../mini) with the browser taken out of the core: same signals, same compilerless JSX, same "build the node once and mutate it forever" model, but every platform call goes through a `Host` the caller supplies. It ships from the [mini](../../README.md) monorepo.

**Why a port like this is tractable at all:** the hard part of a React-style native framework is the reconciler — diffing a virtual tree and committing minimal mutations across a bridge. There is none here. JSX builds a host node immediately and signals mutate it in place, so targeting a platform means implementing one `Host` (about 15 functions) and nothing else.

That leaves one hard requirement for a new target: **its node tree must be mutable**. A renderer whose tree is immutable and re-committed on every change (React Native's Fabric, for instance) is a poor fit, because every attribute write would become a whole-tree commit.

---

## Installation

```bash
npm install @amritk/mini-native
# or
pnpm add @amritk/mini-native
# or
yarn add @amritk/mini-native
# or
bun add @amritk/mini-native
```

Point the JSX transform at the runtime in your `tsconfig.json`:

```jsonc
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@amritk/mini-native" } }
```

---

## Quick start

```tsx
import { mount, setHost, signal } from '@amritk/mini-native'
import { createDomHost, domRoot } from '@amritk/mini-native/hosts/dom'

setHost(createDomHost()) // once, before anything renders

const Counter = () => {
  const count = signal(0)
  return (
    <view onTap={() => count(count() + 1)}>
      <text>{() => `tapped ${count()} times`}</text>
    </view>
  )
}

const dispose = mount(domRoot(document.body), Counter)
```

Swap `createDomHost()` for `createLynxHost()` and the same tree runs on a device. Nothing above the host line changes.

---

## The reactivity rule

There is no compiler analysing your expressions, so reactivity is decided by **value shape at runtime**:

- A **function-valued** prop, child, or `show` is reactive — re-applied whenever the signals it reads change.
- Any **other value** is static — applied once at creation, never again.

Signals are zero-argument functions, so passing one **without calling it** is already a live binding:

```tsx
<view show={visible}>          {/* reactive — tracks forever      */}
<view show={visible()}>        {/* STATIC — frozen at creation!   */}
<text>{() => `${count()}`}</text>  {/* reactive derived text       */}
```

The one prop this rule does not reach is `input multiline`, which is structural: it decides which control the host *builds*, and no target can turn an input into a textarea afterwards. It is typed as a plain boolean so a getter cannot silently apply once and then never again.

Effects run synchronously on write. The flush scheduler already collapses a burst of writes into a single commit, but not the property writes leading up to it — wrap related writes in `batch` when each one would otherwise cross the bridge on its own.

---

## The element vocabulary is native, not HTML

`JSX.IntrinsicElements` is `view | text | image | scroll-view | input` — not `HTMLElementTagNameMap`. That inversion is load-bearing: it keeps the DOM library out of the core entirely, and it makes the browser a **preview target for a native app** (`view` renders as a `<div>`, `text` as a `<span>`) rather than the real target that native approximates.

| Tag | Props beyond the common set |
|:---|:---|
| `view` | — (element children only) |
| `text` | `lines` (line clamp), `selectable` — the only tag that accepts a text run |
| `image` | `src`, `fit`, `onLoad`, `onError` — a leaf, no children. The accessible name is `label`, not `alt` |
| `scroll-view` | `axis`, `onScroll` (element children only) |
| `input` | `value`, `placeholder`, `readonly`, `multiline`, `keyboard`, `secure`, `submitLabel`, `autoComplete`, `onInput`, `onChange`, `onSubmit` — a leaf, no children |

`submitLabel` and `onSubmit` are the portable pair replacing the web's Enter-to-submit-inside-a-`<form>`: no form element in the vocabulary, and `enterkeyhint` on the web means the browser raises the same confirm key a device does. `onSubmit` does not fire on a multiline field, where the key inserts a newline on every target, nor on the Enter that chooses an input-method candidate.

Common to all: `ref`, `show`, `class`, `style`, `id`, `testId`, `key`, `autoFocus`, the gestures `onTap` / `onLongPress` / `onPointer`, and `onFocus` / `onBlur` / `onHoverIn` / `onHoverOut`. `onHoverIn` and `onHoverOut` **never fire on a touch** — a hover-only affordance is a design bug, not a platform difference to smooth over, so nothing synthesises a fake hover from a tap. Event names are the native idiom — tapping is the gesture that actually exists on a device — and the DOM host maps them back onto mouse events. There is no delegation and no capture phase, because native targets have no bubbling to hook into.

`children` is **per tag**, not common, because what a tag may contain differs sharply. Only `text` accepts a text run; `view` and `scroll-view` take elements only; `image` and `input` are leaves. That is not pedantry — Lynx will not render a text run outside a `<text>`, so `<view>hello</view>` builds a screen that silently comes up blank on a device while looking perfectly fine in the browser preview. It is a compile error instead.

Handlers are typed `unknown` by default, since only the installed host knows what an event is. Fill them in once for the target you ship:

```ts
declare module '@amritk/mini-native' {
  interface NativeEventMap { tap: MouseEvent; input: InputEvent }
}
```

---

## What an element means

Five tags describe *shape*, not meaning, so every element also takes a `role`.
One prop, two targets: a native host turns it into an accessibility role, and
the DOM host builds the actual element — so `role="button"` is a real
`<button>`, with focus order, Enter and Space activation, and form submission
already correct rather than re-synthesised onto a `<div>`.

```tsx
<view role="button" label="Add to cart" onTap={add} />
<text role="heading" level={2}>Pricing</text>
<view role="link" href="/pricing" />
```

| Prop | |
| --- | --- |
| `role` | `button`, `link`, `heading`, `list`, `listitem`, `banner`, `navigation`, `main`, `contentinfo`, `none`. **Static** — it decides what the host builds, and a node cannot change what it is. |
| `level` | Heading depth 1–6, defaulting to 2. Static, for the same reason. |
| `label` | The accessible name. The only spelling of it — `image` has no separate `alt`. |
| `hint` | Supplementary description, announced after the name. |
| `focusable` | Whether the element takes part in focus order. `false` writes an explicit opt-out, since a `<button>` is focusable without being asked. |
| `disabled`, `selected`, `checked`, `expanded` | State. The last three write `false` out rather than removing the attribute: a collapsed disclosure and a thing that does not expand are different sentences. |
| `href` | Where a `role="link"` points. Ignored by hosts with nothing addressable. |

Two roles deliberately do *not* get their obvious HTML element. `list` and
`listitem` build a generic element carrying the ARIA role, because `<ul>`
accepts only `<li>` — a parse-level content model — and the control-flow
components put a wrapper in between:

```tsx
<For each={rows} as="view" role="list">
  {(row) => <view role="listitem">…</view>}
</For>
```

That wrapper is why `role` on a collection needs an `as` container: the default
one is presentational on every host, so that a framework-inserted node can never
interpose between a list and its items in the accessibility tree.

## API

### Core (`@amritk/mini-native`)

| Export | Purpose |
|:---|:---|
| `signal(initial)` | A writable signal. Call with no argument to read, with one to write. |
| `computed(fn)` / `effect(fn)` / `effectScope(fn)` | Re-exported from [alien-signals](https://github.com/stackblitz/alien-signals), so nothing else in a codebase imports it directly. |
| `batch(fn)` | Groups several writes into one propagation pass, so dependent effects run once rather than once per write. |
| `watch(get, callback, options?)` | Runs `callback` when the tracked value **changes**, skipping the initial run unless `{ immediate: true }`. The callback runs untracked. |
| `untrack(get)` | Reads without subscribing — for an effect that needs a value but must not re-run when it changes. |
| `onCleanup(fn)` | Teardown registered against the enclosing scope. |
| `setHost(host)` / `requireHost()` / `clearHost()` | Install, read, and reset the renderer. One host per JavaScript context. |
| `mount(container, component)` | Application root: runs `component` in an owning scope, inserts its node, returns a `dispose` that removes the node and tears the scope down. |
| `list(container, items, key, create)` | The only reconciler — keyed collections over four host operations, move-minimal. |
| `renderChild(wrapper, select)` | Reactive single-slot swap; the base of the control-flow components. |
| `bindText` / `bindProp` / `bindShow` / `bindValue` | Imperative bindings for `ref` code. `bindValue` is two-way and holds writes during IME composition. |
| `focus(element)` / `blur(element)` | Moves keyboard focus. A call rather than a prop, because `focused={true}` has no correct meaning once the user taps elsewhere. No-ops on a target with no focus concept. |
| `ELEMENT_TAGS`, `ROLES`, `ElementProps`, `ElementTag`, `Role`, `NativeEventMap` | The element vocabulary and role set, at runtime and in types. Augment `NativeEventMap` to type your handlers. |
| `Host`, `HostElement`, `HostNode`, `HostText`, `Component`, `MaybeReactive`, … | The renderer contract and the shared types. |

### Control flow (`@amritk/mini-native/flow`)

| Export | Purpose |
|:---|:---|
| `<Show>` | Two-way conditional. A function child receives a **getter** for the narrowed value, so a truthy→truthy change updates in place instead of rebuilding the branch. |
| `<Switch>` / `<Match>` | Multi-way conditional, first truthy branch wins. Losing branches are never built. |
| `<Dynamic>` | The general subtree swap both of the above are built on. |
| `<For>` | Keyed collections, backed by `list`. Key on item identity; this is the right default. |
| `<Index>` | Position-keyed collections, for values that can legitimately repeat. Each row receives a **getter** for whatever item currently occupies its slot. |
| `defaultKey` | The identity function `For` uses when no `key` is given. |

Each renders into a wrapper the host supplies via `createFlowHost` — a `display: contents` div on the web, an ordinary container view natively.

`For` and `Index` differ in what identifies a row, and the choice is load-bearing. `For` keys on the item, so a row follows its data through a reorder and keeps its focus and input state; two items with the same key are reported and dropped. `Index` keys on the slot, which is what makes `['red', 'red', 'blue']` renderable — but a row then belongs to the position rather than to the item, so anything living inside it stays behind when the data moves.

### Components (`@amritk/mini-native/ui`)

The named things a screen is actually written in. **The package ships the semantics; the app ships the taste** — `<Button>` knows that a button is a button on both targets, is reachable by keyboard on both, and is *unavailable* rather than merely greyed; it does not know that your buttons are 44px tall with a 6px radius.

| Export | Builds | Semantics |
|:---|:---|:---|
| `<Text>` | `text` | none — and it cannot become a heading, which is the point |
| `<Heading level={2}>` | `text` | `role="heading"` + level. A real `<h2>` on the web |
| `<Button>` | `view` | `role="button"`, focusable. `as="link"` for a button that navigates |
| `<Link href>` | `view` | `role="link"`, focusable. A real `<a href>` on the web |
| `<Stack>` / `<Row>` | `view` | none — layout only, column and row |
| `<List>` / `<ListItem>` | `view` | `role="list"` / `"listitem"` |
| `<Screen>` | `view` | `role="main"`, plus the safe-area insets |
| `ThemeContext` | — | The type scale, tones, and spacing steps, as a **signal** |

Two things are worth knowing about it.

**Write screens in these rather than in tags.** It is the highest-leverage habit in a cross-platform codebase, because it is what keeps every decision underneath reversible: write `<view role="button" focusable label={…}>` across two hundred screens and the vocabulary is load-bearing everywhere; write `<Button>` and it appears in about a dozen components, at which point the role layer, the event payloads, and even the choice of vocabulary can change without a screen being touched. The rule: *a screen file should contain almost no vocabulary tags.*

**`<Button>Save</Button>` works even though `<view>Save</view>` does not compile.** A container refuses a bare text run because on a device a run outside a `text` element renders nothing; a component is different — it has an opinion about its own contents, and its label needs a `text` element on every target anyway. The wrap lives in the component layer and never in the runtime.

**`size` and `level` are two props, always.** A real page needs an `h2` that renders small (a sidebar header) and large text that is not a heading at all (a stat). Couple them and authors start picking heading levels by how big they want the text, which is how a document outline stops being navigable. `Text` has no `role` or `level` on its surface at all, so it enforces the split rather than documenting it.

```tsx
<Heading level={2} size="sm">Related</Heading>  // an h2 that renders small
<Text size="xl">$4,200</Text>                   // large, and not a heading
```

The theme is a **signal**, which is load-bearing: a component runs exactly once and therefore reads context exactly once, so a plain theme would be frozen at boot. Holding the signal means a dark-mode switch reaches the whole tree with no re-render and no invalidation machinery — the same node, with a style mutated. Not providing a theme is a supported state; the fallback is a real one, so components render on their own in a test.

### Routing (`@amritk/mini-native/router`)

| Export | Purpose |
|:---|:---|
| `createRouter({ routes, history })` | Matches the current location into a reactive `route` signal. Also `navigate`, `back`, and a `canGoBack` signal. |
| `createMemoryHistory(initial?)` | A navigation stack in memory — the *native* history as much as the test one. |
| `<RouteView router fallback?>` | Renders the matched route. |
| `<RouteLink to navigate>` | A real link that navigates through the router. |
| `matchRoute` / `parseQuery` | The pure halves, exported for anything that needs them directly. |
| `createBrowserHistory({ mode, base })` | From `@amritk/mini-native/router/browser` — the web's session history, `history` or `hash` mode. |

The split is the design. **Matching a pattern against a path is string arithmetic** and ports for nothing. **Moving between locations is not**: a browser has an address bar, a back button, and a session history shared across tabs; a device has a navigation stack the app owns and nothing the user can type into. So the router takes a `RouterHistory`, and the browser one lives on its own entry — importing `/router` never drags a `window` reference into a device build, which the boundary suite asserts.

`RouteView` keeps the screen when only the params changed. `/users/1` → `/users/2` is the same route, so scroll position, a focused field, and anything in flight survive, and the `params()` getter reports the new values. A different route swaps the subtree.

`canGoBack` counts the steps *this app* took. A browser's `history.length` counts entries from every page the tab has visited, so it cannot answer "would going back leave the app" — which is the only question a back chevron asks.

Not here: a native navigation **stack** (where `/users/2` pushes over `/users/1` and animates — it needs an animation seam that does not exist yet, and would be the wrong default for the web), and the web-only obligations of document title, scroll restoration, and keeping the URL continuously correct, which belong in the app's web entry point.

### Gestures (`@amritk/mini-native/gestures`)

| Export | Purpose |
|:---|:---|
| `pan(element, handlers)` | A drag. Reports position, total displacement, velocity, and whether the target **cancelled** it. |
| `swipe(element, options)` | A flick in one of four directions, gated on both distance and end velocity. |

The design is two layers, and the split is what makes gestures portable at all. **The host normalises** — a browser's Pointer Events and an engine's touch events become one `PointerEvent` with an id, an element-relative position, and a phase. That is the only part that cannot be written once, and it needed no new host method. **The recognisers are arithmetic**: `pan` and `swipe` know nothing about any platform, and `swipe` is built on `pan`.

```tsx
<view ref={(element) => swipe(element, { onSwipe: (event) => event.direction === 'left' && dismiss() })} />
```

A **cancel** is not an end. It is the target taking the gesture away — a scroll container claiming the drag, a call arriving — and a recogniser that treats it as an `up` commits gestures nobody made. `swipe` never fires on one.

Pinch and rotate are writable over the same stream (`PointerEvent.id` is what makes multi-touch expressible) and are deliberately not shipped: their thresholds are worth tuning against a real screen rather than guessed at.

### Composition (`@amritk/mini-native/composition`)

| Export | Purpose |
|:---|:---|
| `createContext(fallback)` | `provide(value, build)` / `use()`. `build` is a **function**, because JSX builds nodes eagerly — an element child would be constructed before the provider ever ran. |
| `<Portal target>` | Renders a subtree into an element the app owns. Modals, sheets, toasts. |
| `<ErrorBoundary fallback>` | Catches a throw while *building* the subtree, and offers a `retry`. |

`@amritk/mini` refuses context on purpose and is right to — it prop-drills, and its consumer is a byte-budgeted widget. The calculus differs here **specifically because of cross-platform**: the things that vary by platform — theme, insets, navigation, locale, colour scheme — are exactly the things you do not want in a component's signature. Prop-drill them and every intermediate component grows a platform-shaped prop it does not use, which is write-once eroding one signature at a time.

A component runs exactly once and therefore **reads context exactly once**, so a context whose value changes over time holds a *signal*, not a value. That is what makes a live dark-mode switch work with no re-render and no invalidation machinery at all.

Context reaches subtrees that `Show`, `For`, and friends build *later* — those capture the ambient frame where they were written and restore it around every build. Without that a theme would reach everything except the parts of an app behind a conditional, and would fail silently to its default.

`ErrorBoundary` catches construction, not everything. A throw inside an effect three seconds later, in a handler, or in a promise happens long after every component finished running, and belongs to the code that started it.

### Platform (`@amritk/mini-native/platform`)

| Export | Purpose |
|:---|:---|
| `platform.os` | How the installed host names itself — `web`, `lynx`, `memory`, or `unknown`. |
| `platform.select({ web, native, default })` | Picks a value per target: exact OS name first, then `native` for any named non-web target, then `default`. |
| `colorScheme()` | `'light'` / `'dark'`, as a signal. |
| `dimensions()` | The drawable area in density-independent pixels, as a signal. |
| `safeArea()` | Insets from each edge, as a signal. What `<Screen>` is built on. |

**Prefer the environment to the OS name.** A name is a proxy for the thing you actually care about — whether there is a notch, whether hover exists, whether anything is addressable — and proxies rot: `os === 'web'` typechecks forever and is wrong the day a second web-shaped target appears. There is deliberately no capability registry (`canHover`, `hasBackButton`) yet: designing the flag set before three real branches exist would be guesswork.

Everything here is a **signal**, because a component runs exactly once — a plain value would be frozen at the moment the component was built, and the rotation or theme switch afterwards is the entire point.

When a difference is *structural* rather than a leaf value, do not branch — split the file. `.web.tsx` / `.native.tsx` needs no runtime support, only resolution order in the bundler:

```ts
// vite.config.ts
resolve: { extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js'] }
```

A whole file that is obviously platform-specific is reviewable, greppable, and countable. An inline OS branch in the middle of a component is invisible divergence, and it accumulates faster than anyone expects.

### Hosts

| Import | Target |
|:---|:---|
| `@amritk/mini-native/hosts/dom` | `createDomHost({ reset })` + `domRoot(element)` — the web target, and the only place in the package that knows what HTML is. Installs the **layout reset** by default: one zero-specificity stylesheet that makes a browser lay out like Yoga, so an unstyled container does not stack vertically on a device and horizontally here. Pass `{ reset: false }` when this runtime is a guest in a page whose styling you do not own. |
| `@amritk/mini-native/hosts/lynx` | `createLynxHost(api?)` + `lynxRoot(element)` — drives [Lynx](https://lynxjs.org)'s Element PAPI. Takes the PAPI as an argument, so it is testable against a fake engine. |
| `@amritk/mini-native/hosts/memory` | `createMemoryHost()` — plain objects, no platform. The reference implementation and what the test suite runs against. |
| `@amritk/mini-native/hosts/memory/serialize` | `serializeMemoryTree(node)` — the in-memory tree as an indented string, for assertions. |
| `@amritk/mini-native/hosts/memory/dispatch` | `dispatchMemoryEvent(element, name, event)` — fires a handler on the in-memory tree. |
| `@amritk/mini-native/host` | The `Host` type on its own, for writing a new one. |

---

## Writing a host

Implement `Host` and pass it to `setHost`. Read `src/hosts/create-memory-host.ts` first — it is the shortest complete implementation and exists partly to be that reference. Points worth knowing:

- **`createFlowHost` is separate from `createElement`** because the right wrapper differs per target.
- **`createElement` receives the prop bag**, for the few props that decide what gets *built* rather than how it behaves. Ignore the argument if your target has none.
- **A style write must not disturb visibility.** `setVisible` and `setStyle` are easiest to implement through one channel — inline `display` on the web, inline styles on Lynx — and then a wholesale style replacement quietly un-hides a hidden element. If the two share a channel, remember the visibility and re-assert it. Both shipped hosts show the shape.
- **A bare number in a style bag means density-independent pixels**, the React Native convention, and adding the unit is the host's job. `src/hosts/to-style-text.ts` does it for the shipped hosts.
- **`flush` is optional.** Define it if your target batches. The runtime never calls it per mutation — a whole tick of changes coalesces into a single commit, against whichever host is installed when that commit runs.
- **Hosts must tolerate unknown event names.** `bindValue` subscribes to `compositionstart` / `compositionend`, which native targets never fire.

---

## Building for both targets

The runtime ports for almost nothing — that is the whole finding of this package — so the risk in a cross-platform codebase is not architectural, it is behavioural:

> **Whichever target you develop against daily is the one your code will work on. The other becomes a port.**

The web is both the more permissive target and the more comfortable one to work in. Build in a browser and check the device on Fridays, and by month three you have a web app with a native build that does not work — not because anyone decided that, but because every mistake the browser forgave went uncorrected. Four things fight that, and three of them are habits rather than API.

**1. Two entry points, both running, before the first screen.** This is the only line in an app that differs per target, and it is the sanctioned place for divergence — anything else calling `setHost` is a bug, and a cheap one to lint for.

```ts
// main.web.ts
import { createDomHost, domRoot } from '@amritk/mini-native/hosts/dom'
setHost(createDomHost())
mount(domRoot(document.body), App)

// main.lynx.ts
import { createLynxHost, lynxRoot } from '@amritk/mini-native/hosts/lynx'
setHost(createLynxHost())
mount(lynxRoot(root), App)
```

If both are not running before the first screen exists, the project is web-first by default regardless of intent. If you can only watch one, watch the device — the browser will not tell you what you got wrong, and the device will.

**2. Test against the memory host, in plain node.** A suite running in happy-dom will cheerfully pass code that only works in a browser. One running where `document` genuinely does not exist cannot.

```ts
const memory = createMemoryHost()
setHost(memory.host)
mount(memory.rootElement, App)
expect(serializeMemoryTree(memory.root)).toContain('…')
```

**3. Write screens in components, never in primitives.** *A screen file should contain almost no vocabulary tags.* If the vocabulary lives in a dozen components rather than two hundred screens, the role layer, the event payloads, the theme — and even the choice of vocabulary — can change without a screen being touched. This is what buys the option to change your mind, and it costs nothing, because a design system was going to exist anyway.

**4. Make divergence visible, and count it.** Split the file for anything structural, and keep `platform.select` for leaf values only — a padding, a duration, a line count:

```ts
// vite.config.ts — no runtime support needed, only resolution order
resolve: { extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js'] }
```

A whole file that is obviously platform-specific is reviewable, greppable, and countable. An inline OS branch in the middle of a component is invisible divergence, and it accumulates faster than anyone expects. **Count the platform-specific files** — it is the only honest measure of whether write-once is holding, and a number that climbs steadily means the abstraction is in the wrong place, not that the app genuinely needed the branches.

---

## Known gaps

Deliberate omissions and unbuilt work, listed so nobody has to rediscover them.

Deliberate:

- **No raw-markup sink, ever.** There is no `bindHtml` equivalent anywhere in the host contract, so bound data cannot inject elements on any target.
- **No `bindClass`.** The reactive `class` prop covers it and keeps the contract smaller.
- **No fragments.** Every piece of UI is one root element, which is also how a native view tree works. The cost is a real container view per component.

Not built yet:

- **No virtualised list.** `For` over ten thousand rows creates ten thousand host elements; Lynx ships a recycler this should bind to.
- **No pinch or rotate.** Both are writable over the normalised pointer stream and neither is shipped: their thresholds are worth tuning against a real screen rather than guessed at.
- **`ErrorBoundary` covers construction only.** A throw inside an effect, a handler, or a promise happens after every component has finished running, and belongs to whoever started it.
- **No animation seam**, so an animation is a bridge write per frame on a native target.
- **No responsive primitive.** `dimensions()` works and branching on it works, but there is no `@media`-shaped abstraction — a native target has no media queries, and inventing one before there are real call sites would be speculation.
- **The reset is asserted, not observed.** Its suite checks that the rules are installed and stamped onto the right elements; it cannot check that a container then stacks its children, because happy-dom lays nothing out. Screenshots on two real targets are the only thing that would.
- **No capability flags** (`canHover`, `hasBackButton`). `platform.select` and the environment accessors cover the cases that exist; the flag set is worth designing once three real branches do.
- **The Lynx host does not read its own environment.** It takes one as an argument instead — the PAPI subset it drives is element-level, and the engine's system-information globals vary by version with no fake to test against.
- **No forms or query.** [`@amritk/mini`](../mini) has both, and both are close to platform-free — they are simply not ported yet.
- **No navigation stack or transitions.** `RouteView` is a single slot; pushing a screen over another and animating between them needs an animation seam that does not exist.

---

## License

MIT
