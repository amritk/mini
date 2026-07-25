# `@amritk/mini-native` — write once, run on web and native

A design note, not a plan of record. It works out what has to change for a
component written against the native vocabulary to be a *production* web page as
well as a device screen, and in what order.

**Style is deliberately out of scope here**, and there is a section at the end
saying why it is the harder half rather than the easier one.

---

## 1. The shift

Today's charter, from `AGENTS.md`:

> The element vocabulary is native, not HTML. […] the browser is the *guest*
> here, a preview target for a native app.

That inversion was the right call and it stays. What changes is the *status* of
the web output. Right now `hosts/dom` is explicitly a preview: it renders `view`
→ `<div>` and `text` → `<span>` so you can develop with fast reload and real
devtools, and nobody claims the result is a page you would ship. "Write once,
run on both" means the same host has to produce a page you *would* ship — same
components, no second implementation, no apology.

Preview and production differ on exactly one axis, and it is not appearance:

**A preview only has to look right. A page has to mean something.** Every
element the DOM host emits today is a `<div>` or a `<span>`. That is fine for
looking at, and it is a product defect for shipping — a screen reader gets
nothing, `onTap` on a `<view>` is a click handler on a div that no keyboard can
reach, and there is no `<a href>` anywhere for a crawler or a middle click to
find.

Which leads to the one genuinely good piece of news in this document.

## 2. The web gap and the native gap are the same gap

The audit's number one native priority is accessibility:

> **Accessibility props** across the vocabulary and in the `Host` contract.
> Still the largest single omission […] far cheaper to design in while the
> vocabulary is five tags.

The information a native host needs for `accessibilityRole` is *exactly* the
information the DOM host needs to pick `<button>` over `<div>`. One design
closes both. That is not a coincidence — it is the same fact about the element
("this is a button") arriving at two targets that spell it differently, which is
the entire job of a host.

So the first slice of cross-platform work is the accessibility layer, and it
pays for itself twice.

## 3. What already carries over

Worth stating plainly, because the remaining list reads longer than it is. All
of this is portable today, unchanged:

- The reactivity model, `list`, and every control-flow component. Nothing in
  `flow/` mentions a platform.
- The five tags, their children rules, and `ContainerChildren` refusing bare
  text inside a container — the one place the web is deliberately made *stricter*
  than it needs to be so a device does not surprise you.
- `class`, `style`, `show`, `ref`, `testId`, and the reactive-if-it-is-a-function
  rule.
- `onTap` / `onLongPress` / `onFocus` / `onBlur`, and the per-tag handlers.
- `NativeEventMap`, which already solves the "an event is whatever the host says
  it is" problem through declaration merging.

The gaps below are additive. None of them asks for a different runtime.

## 4. What does not carry over

### 4.1 Semantics — the whole of it

Everything is a `div` or a `span`. There is no `role`, no accessible name, no
focusability, no state (`checked`, `expanded`, `selected`), no heading level, no
landmark. On a device this is an app-store problem. On the web it is that plus
keyboard operability, plus SEO, plus the browser's own affordances (form submit,
open-in-new-tab, find-in-page).

### 4.2 Interaction beyond tap

`onTap` maps to `click` on the DOM host, so a mouse works and a keyboard does
not. A `<view role="button">` that renders as a `<div>` is unreachable by Tab and
unactivatable by Enter or Space. That is not a missing feature, it is a broken
one — the component *looks* interactive on both targets and is only interactive
on one.

The reverse also exists: hover and pointer-precision are real on the web and
absent on touch, and pan/swipe/pinch are the opposite. Both directions need an
answer that is honest about degradation rather than silently doing nothing.

### 4.3 Nowhere to put a difference

Some things genuinely cannot be written once, and today there is no sanctioned
way to say so. No platform introspection, no capability query, no build-time
file-variant convention. Without one, apps will reach for `typeof document !==
'undefined'`, which is both wrong (the memory host has no document either) and
unreviewable.

### 4.4 No environment

Safe-area insets, viewport dimensions, orientation, colour scheme. Already on
the audit's list. They matter more here than in a native-only world, because
they are precisely the things you *would* branch on — and a good environment
API removes most of the pressure on 4.3.

### 4.5 No navigation

Web needs real URLs — addressable, back-button-correct, crawlable. Native needs
a nav stack. `mini` has a router; `mini-native` has none. The matcher half is
pure and portable, the navigator half is not.

---

## 5. Proposed design

### 5.1 A `role` prop, not new tags, and not new host methods

Add to `CommonProps`:

```tsx
<view role="button" label="Add to cart" onTap={add} />
<text role="heading" level={2}>Pricing</text>
<view role="list">
  <view role="listitem">…</view>
</view>
```

A closed, small role set, each with a real mapping on both sides:

| `role`     | DOM host builds        | Native host sets            |
| ---------- | ---------------------- | --------------------------- |
| `button`   | `<button type=button>` | `accessibilityRole=button`  |
| `link`     | `<a href>`             | `accessibilityRole=link`    |
| `heading`  | `<h1>`…`<h6>` by level | heading + level             |
| `list`     | `<ul>`                 | `accessibilityRole=list`    |
| `listitem` | `<li>`                 | list item                   |
| `header`   | `<header>`             | landmark                    |
| `nav`      | `<nav>`                | landmark                    |
| `main`     | `<main>`               | landmark                    |
| `footer`   | `<footer>`             | landmark                    |
| `none`     | unchanged + `aria-hidden` | excluded from the a11y tree |

Three things make this the right shape for *this* codebase:

**It needs no new `Host` methods.** Roles and their companions arrive through
`createElement`'s existing props parameter and through `setProperty`. `Host`
stays at about fifteen functions, which is the number that keeps a port to a new
target a one-file job.

**`role` is static, and there is already precedent.** On the DOM it decides
*what element to build*, and a node cannot change what it is — the same
constraint `multiline` already lives under, documented in `createElement`:

> Props consumed at creation are STATIC — a getter is not tracked, because a
> node cannot change what it is.

So `role` and `level` join `multiline` as structural props with no reactive
form. Everything else in the layer is ordinary and reactive.

**It keeps the vocabulary at five tags.** `AGENTS.md` requires "a genuine
cross-platform justification" for new vocabulary, and a semantic *tag* set
(`button`, `link`, `heading`) would triple it while saying nothing a native
toolkit cannot already say with `accessibilityRole`. An ergonomic component
layer — `<Pressable>`, `<Link>` — can sit on top later without contradicting
this; it composes, whereas new tags do not.

The companion props, all reactive, all on `CommonProps`:

- `label` — the accessible name. `aria-label` / `accessibilityLabel`.
- `hint` — supplementary description. `aria-description` / `accessibilityHint`.
- `focusable` — participates in focus order. `tabindex` / focusable.
- `disabled`, `selected`, `checked`, `expanded` — state, to `aria-*` and the
  native equivalents. (`disabled` is on `input` today and gets promoted.)
- `href` — accepted only alongside `role="link"`; ignored by hosts with no
  addressable concept.

### 5.2 Tappables are operable, or they are not tappables

The DOM host builds a real `<button>` for `role="button"` and a real `<a>` for
`role="link"`. Focus order, Enter and Space activation, form submission, and
middle-click all come free and correct, rather than being re-synthesised from
keydown handlers that will be subtly wrong.

The cost is that a `<button>` arrives with user-agent styling and its own
constraints on what may nest inside it. That is a style problem, and it is the
first concrete reason the style phase has to come *second* rather than being
independent: the reset exists to make correct semantics look right, so there is
nothing to reset until the semantics land.

For a tappable that is *not* one of the semantic roles, the host adds
`tabindex` and synthesises activation. That path should be the exception.

### 5.3 One place to put a difference

`Host` grows one optional **field** — not a function, so the porting budget is
untouched:

```ts
type Host = {
  /** How this target names itself. Absent means 'unknown'. */
  readonly platform?: string
  …
}
```

and the runtime exposes the two things apps actually reach for:

```ts
import { platform } from '@amritk/mini-native'

platform.os                                       // 'web' | 'lynx' | 'memory' | …
platform.select({ web: 12, native: 16, default: 14 })
```

Deliberately *not* built yet: a capability registry (`canHover`, `hasBackButton`,
`isAddressable`). Branching on a capability beats branching on an OS name, but
designing the flag set before any real branch exists is speculation, and this
repo's rule is that a feature only some apps need has to justify itself first.
Revisit once there are three real call sites.

Whole-component divergence is a **bundler** concern, not a runtime one, and it
needs no code at all today — Vite resolves it with configuration:

```ts
resolve: { extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', …] }
```

Document that; do not build it.

### 5.4 Environment as optional host state

```ts
type Host = {
  readonly environment?: HostEnvironment
  …
}

type HostEnvironment = {
  readonly colorScheme: ReadonlySignal<'light' | 'dark'>
  readonly dimensions: ReadonlySignal<{ width: number; height: number }>
  readonly safeArea: ReadonlySignal<{ top: number; right: number; bottom: number; left: number }>
}
```

Optional, with static fallbacks when a host omits it, so the memory host stays a
dozen lines and no existing host breaks. The DOM host wires `matchMedia`, a
resize listener, and the `env(safe-area-inset-*)` custom properties; Lynx wires
its own. This is cheap on both sides and it removes most of the reason to reach
for `platform.os` in application code.

### 5.5 Navigation: shared matcher, split navigator

Port `mini`'s `matchRoute` and `parseQuery` as-is — they are pure. Split the
navigator behind an interface with a history implementation on the web and a
nav-stack implementation natively. `<Link>` renders `role="link"` with `href`,
so the DOM host gives it a real `<a>` and the browser's own affordances survive,
while a native host treats the same element as a push onto the stack.

---

## 6. Explicitly out of scope

- **Style, the layout reset, and the theme system.** Section 7.
- **SSR and hydration.** The runtime *creates* nodes; it has no way to *adopt*
  existing ones. Hydration would need a `Host.adopt` seam that walks a
  server-rendered tree instead of building one — and, interestingly, that is
  easier here than in React, because with no virtual tree there is nothing to
  reconcile, only an ordered walk. Not foreclosed. Not now.
- **Fragments.** Still deliberately absent. Worth noting the cost is *higher* on
  the web than the README implies — a wrapper div per component breaks a parent
  `flex` or `grid` in a way a native container view does not. Not reopened here.
- **Virtualised lists, gestures, animation, context, portal, error boundaries.**
  All still on the audit's list, all orthogonal to this. Portal is the one that
  will surface first, since modals need it on both targets.

## 7. Why style is the hard half

"Add style later" is right as sequencing and wrong as difficulty. Everything
above is additive: new props, new optional host fields, no behaviour change to
anything that exists. Style is not, because the two targets do not agree on what
an element *is* before you write a single declaration:

| | Native (Yoga) | Web (CSS) |
| --- | --- | --- |
| `display` | always flex | `block` |
| `flexDirection` | `column` | `row` |
| `position` | `relative` | `static` |
| `flexShrink` | `0` | `1` |
| text | does not inherit | inherits |
| overflow | hidden | visible |

An unstyled `<view>` with two children stacks vertically on a device and
horizontally on the web. That divergence is not cosmetic — it is the difference
between write-once being true and being a slogan — and closing it means the DOM
host ships an opinionated reset that makes the browser behave like Yoga. That is
a real decision with real weight, and it deserves its own note rather than a
paragraph in this one.

The upside of doing semantics first is that the reset then has a fixed target:
you are resetting `<button>`, `<a>`, `<ul>`, and `<h1>` — a known, finite set —
instead of guessing.

## 8. Keeping it honest

The failure mode for cross-platform is silent drift: the web target keeps
working while the native one quietly stops matching, because nobody ran it.
This repo already prefers structural tests for exactly this class of problem
(`import-boundary.test.ts`, `core-size-budget.test.ts`), and the same trick
applies.

A **parity suite**: one directory of component fixtures, each rendered through
all three hosts, asserting the *semantic* outcome on each — role, accessible
name, focusability, state — rather than the markup. `serialize-memory-tree.ts`
already gives the shape for the memory side. A role that lands on the DOM and
not on Lynx fails the suite instead of failing on a device.

## 9. Order of work

1. **The accessibility layer** — `role`, `level`, `label`, `hint`, `focusable`,
   state props; role-driven element construction and real semantic elements in
   the DOM host; the native mapping in the Lynx host. Closes the audit's number
   one native gap and the number one web gap together.
2. **Operable tappables** — semantic elements first, synthesised activation as
   the fallback. Falls out of (1) almost entirely.
3. **`platform.os` / `platform.select`**, and the documented `.web.tsx`
   resolution convention.
4. **`Host.environment`** — colour scheme, dimensions, safe area.
5. **The parity suite**, alongside (1) rather than after it.
6. **Style**: the layout reset, then the theme story. Its own design note.
7. Navigation, then portal.

Steps 1 through 5 need no change to any existing behaviour, and `Host` grows two
optional fields and no methods.
