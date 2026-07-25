# `@amritk/mini-native` — write once, run on web and native

A design note, not a plan of record. It works out what has to change for a
component written against the native vocabulary to be a *production* web page as
well as a device screen, and in what order.

**Style is deliberately out of scope here**, and §12 says why it is the harder
half rather than the easier one.

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
- `bindValue`'s composition handling, which was already written to no-op on
  targets that do not emit IME events.

The gaps below are additive. None of them asks for a different runtime.

## 4. The two structural gaps

Almost everything in §5–§9 is an instance of one of these two.

### 4.1 Elements have no meaning

Everything is a `div` or a `span`. There is no `role`, no accessible name, no
focusability, no state (`checked`, `expanded`, `selected`), no heading level, no
landmark. On a device this is an app-store problem. On the web it is that plus
keyboard operability, plus SEO, plus the browser's own affordances (form submit,
open-in-new-tab, find-in-page). §5–§7 are the fix.

### 4.2 Events have no shape — and this is the one that bites first

`NativeEventMap` is `unknown` for every entry, with the app narrowing it once
against the host it ships:

> Every entry is `unknown` here on purpose, because this package cannot know
> what an event is […] Rather than pick one and be wrong on the other target,
> the map is left open for the APP to fill in through declaration merging.

That reasoning is correct for *arbitrary* events, and it quietly fails for the
handful whose meaning **this framework itself defines**. Consider the most
ordinary thing an app does:

```tsx
<scroll-view onScroll={(e) => headerOpacity(/* … what? */)} />
<view onTap={(e) => ripple(/* … from where? */)} />
```

There is no way to write either of those once. `e` is a `UIEvent` on the web and
a Lynx scroll event on device; reading an offset means branching on the host
inside a component. Declaration merging does not help — merging picks *one*
shape, so an app that ships both targets has to pick the wrong one somewhere.

So write-once fails at the event boundary even with a perfect semantics layer,
and no amount of role mapping fixes it. **The host has to normalise the payloads
of the events the vocabulary names**, exactly as it already normalises `class`
into a string and numbers into `100px`. It is the same principle, applied to the
half of the contract that flows the other way.

That is the single biggest concrete finding of this round, and it is cheap:
`addEventListener` already exists, so this is a change to what hosts *put in*
the event, not to the contract's shape.

---

## 5. The semantics layer

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

| `role`     | DOM host builds           | Native host sets            |
| ---------- | ------------------------- | --------------------------- |
| `button`   | `<button type=button>`    | `accessibilityRole=button`  |
| `link`     | `<a href>`                | `accessibilityRole=link`    |
| `heading`  | `<h1>`…`<h6>` by level    | heading + level             |
| `list`     | `<div role=list>`         | `accessibilityRole=list`    |
| `listitem` | `<div role=listitem>`     | list item                   |
| `header`   | `<header>`                | landmark                    |
| `nav`      | `<nav>`                   | landmark                    |
| `main`     | `<main>`                  | landmark                    |
| `footer`   | `<footer>`                | landmark                    |
| `none`     | unchanged + `aria-hidden` | excluded from the a11y tree |

`list` and `listitem` are the two that deliberately do **not** get their real
HTML element, and the reason is §5.4 — it is a genuine constraint rather than
a preference, and it is the sharpest thing this exercise turned up.

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

Concretely:

```ts
/** Static: decides what the host builds, so there is no reactive form. */
export type Role =
  | 'button' | 'link' | 'heading' | 'list' | 'listitem'
  | 'header' | 'nav' | 'main' | 'footer' | 'none'

type AccessibilityProps = {
  role?: Role
  /** Heading depth, 1–6. Static, for the same reason `role` is. */
  level?: 1 | 2 | 3 | 4 | 5 | 6
  /** The accessible name. `aria-label` / `accessibilityLabel`. */
  label?: MaybeReactive<string>
  /** Supplementary description. `aria-description` / `accessibilityHint`. */
  hint?: MaybeReactive<string>
  /** Participates in focus order. `tabindex` / focusable. */
  focusable?: MaybeReactive<boolean>
  /** Focus this element when it is built. */
  autoFocus?: boolean
  disabled?: MaybeReactive<boolean>
  selected?: MaybeReactive<boolean>
  checked?: MaybeReactive<boolean>
  expanded?: MaybeReactive<boolean>
  /** Accepted only alongside `role="link"`; ignored where nothing is addressable. */
  href?: MaybeReactive<string>
}
```

**Consequence: `image alt` should go.** With `label` on `CommonProps`, `alt` is
a second name for the accessible name on exactly one tag. Two spellings for one
concept is precisely the drift a five-tag vocabulary exists to avoid — fold it
into `label` and let the DOM host emit `alt` for an `<img>`, which is where that
spelling belongs.

### 5.2 Tappables are operable, or they are not tappables

The DOM host builds a real `<button>` for `role="button"` and a real `<a>` for
`role="link"`. Focus order, Enter and Space activation, form submission, and
middle-click all come free and correct, rather than being re-synthesised from
keydown handlers that will be subtly wrong.

The cost is that a `<button>` arrives with user-agent styling and its own
constraints on what may nest inside it. That is a style problem, and it is the
first concrete reason the style phase has to come *second*: the reset exists to
make correct semantics look right, so there is nothing to reset until the
semantics land.

For a tappable that is *not* one of the semantic roles, the host adds `tabindex`
and synthesises activation. That path should be the exception.

### 5.3 Normalised event payloads

Per §4.2. The events the vocabulary names get a shape the framework defines,
built by the host from whatever the target gave it:

```ts
type TapEvent = { readonly x: number; readonly y: number }
type ScrollEvent = { readonly x: number; readonly y: number }
type InputEvent = { readonly value: string }
type PointerEvent = {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly phase: 'down' | 'move' | 'up' | 'cancel'
}
```

`NativeEventMap` keeps its declaration-merging seam for everything else — a host
that emits an event this vocabulary has never heard of is still the app's to
type. What changes is that the *named* events stop being `unknown` and start
being portable. Coordinates are in the element's own space on every target,
because a viewport-relative coordinate means something different once a native
screen has insets.

An honest caveat: `x`/`y` on a tap means the host has to read them off the
underlying event, and a target that fires a tap with no position (a keyboard
activation on the web, an accessibility action on device) has no coordinate to
give. Those arrive as `0, 0`, and that is a documented lie of exactly the kind
this section is trying to remove. The alternative — `x?: number` — pushes a
narrowing onto every ripple effect in the app. Neither is free; the optional
form is probably right, and this is the sort of thing to decide with a real call
site in front of you.

### 5.4 The flow wrapper becomes an accessibility hazard the moment roles exist

Every control-flow component builds its subtree inside a wrapper from
`createFlowHost`, which the DOM host makes a `display: contents` div. That is
invisible to layout and, today, harmless — because nothing in the tree has a
role for it to interpose in.

Add roles and it stops being harmless, on the most ordinary code anyone would
write:

```tsx
<view role="list">
  <For each={items}>{(item) => <view role="listitem">…</view>}</For>
</view>
```

`For` with no `as` builds a flow wrapper, so the DOM output is:

```html
<ul><div style="display: contents"><li>…</li></div></ul>
```

Two separate failures. `<ul>` may only contain `<li>` — that is a *parse-level*
content model, so the browser's own error recovery reshapes the tree and no
attribute can rescue it. And an interposed generic element breaks the
list-owns-listitem relationship that assistive technology walks. The same shape
would break every other required parent/child pairing a richer role set brings
(`tablist`/`tab`, `radiogroup`/`radio`, `menu`/`menuitem`).

It generalises, so it is worth stating as a rule rather than a fix:

> **A wrapper the framework inserted must never be visible to accessibility, and
> must never be a node whose parent has a restrictive content model.**

Which forces two decisions:

**The flow wrapper carries `role="presentation"`.** Cheap, one line per host, and
it keeps `Show`, `Switch`, `Dynamic`, `For`, and `Index` from interposing
anywhere. `display: contents` alone is *not* sufficient — its accessibility-tree
treatment has been inconsistent across browsers and is not something to bet a
semantics layer on.

**`role="list"` builds a `<div role="list">`, not a `<ul>`.** ARIA roles carry no
content-model restriction, so a presentational wrapper between the list and its
items is survivable; a real `<ul>` is not. This is also what React Native Web
concluded, for the same reason.

Note what this does *not* change: `<a>`, `<h1>`–`<h6>`, `<nav>`, `<main>`,
`<header>`, and `<footer>` all take flow content, so a wrapper inside them is
legal and they keep their real elements — and with them the browser affordances
that were the point. `<button>` is the interesting middle case, and §16 is
honest about it.

---

## 6. The component layer

### 6.1 The package ships the semantics, the app ships the taste

The vocabulary is deliberately neutral: `view` and `text` say nothing about what
a thing *is*. §5 adds that back, but writing `<view role="button" focusable
label={…}>` at every call site is exactly the repetition a design system exists
to remove. So: a named component layer on a subpath, per the rule that a feature
only some apps need stays out of the `.` entry.

```tsx
import { Button, Heading, Stack, Text } from '@amritk/mini-native/ui'
```

The line to draw is the whole design of this layer. **The package ships the
semantics; the app ships the taste.** `<Button>` knows that a button is
`role="button"`, is focusable, activates on Enter and Space, and is *disabled*
rather than merely greyed. It does not know that your buttons are 44px tall with
a 6px radius. The first is portable knowledge that is easy to get wrong and
worth centralising once; the second is your product's and changes with it.

That line has two payoffs. `/ui` needs **no new host machinery at all** — it is
pure composition over §5, so it grows the contract by nothing. And because it
has no appearance, every component in it has an assertable semantic outcome on
all three hosts, which drops it straight into the parity suite (§13).

A starting set, small enough to be obviously correct:

| Component            | Builds | Semantics                          |
| -------------------- | ------ | ---------------------------------- |
| `Text`               | `text` | none                               |
| `Heading`            | `text` | `role="heading"` + `level`         |
| `Button`             | `view` | `role="button"`, focusable         |
| `Link`               | `view` | `role="link"` + `href`             |
| `Stack` / `Row`      | `view` | none — layout only                 |
| `List` / `ListItem`  | `view` | `role="list"` / `"listitem"`       |
| `Screen`             | `view` | `role="main"` + safe-area insets   |

`Screen` is the one that earns `Host.environment` (§8.4) its keep: applying the
device's insets is the thing every native screen needs and every web page
ignores, and it should happen in one component rather than in every app.

### 6.2 Typography: what text means and how big it is are different questions

This is the thing most typography systems get wrong, and it is worth being blunt
about because it is unrecoverable later. A real page needs an `h2` that renders
small — a sidebar section header — and needs large text that is not a heading at
all — a hero number, a stat. Couple size to level and authors start picking
heading levels *by how big they want the text*, which is precisely how a
document outline stops being navigable to a screen reader and, on the web, to a
crawler.

So they are two independent props, never one:

```tsx
<Heading level={2} size="sm">Related</Heading>  // an h2 that renders small
<Text size="xl">$4,200</Text>                   // large, and not a heading
<Text size="sm" tone="muted">per seat</Text>
```

`level` drives semantics — `role="heading"` plus the level, which the DOM host
turns into a real `<h2>` and a native host turns into a heading of that depth.
`size` and `tone` drive appearance and resolve against the theme (§9.1).

The default keeps the common path short: `<Heading level={2}>` with no `size`
picks the scale step that matches, so you only reach for `size` when a design
genuinely disagrees with the outline.

### 6.3 `as` — and why it takes a role, not a tag

Vue spells it `<component :is>`; most design systems spell it `as`. The need is
the same and it is real: a thing that should *look* like a button and *be* a
link.

The web's answer is the wrong one here:

```tsx
<Button as="a" href="/pricing">    // ✗ means nothing on a device
```

An HTML tag is not a portable concept, so accepting one would make `as` the hole
through which web-only code re-enters a write-once component — the single thing
this whole note is trying to prevent. `as` should take **a role or a
component**:

```tsx
<Button as="link" href="/pricing">Compare plans</Button>  // <a> on web, link role natively
<Text as={Link} href="/docs">Read the docs</Text>         // compose with another component
```

Three things fall out of that choice.

**`as` is static, and the reactive tool already exists.** `role` decides what
the host builds and so cannot be a getter (§5.1); `as` overrides `role`, so it
inherits the constraint. That is not a gap — polymorphism *over time* is a
different problem and `Dynamic` in `/flow` already solves it. `as` is
polymorphism at build; `Dynamic` is polymorphism across a signal. Conflating
them is the mistake to avoid.

**`as` must not be able to produce nonsense.** `<Button as="link">` is coherent —
both roles are focusable and activatable, so the component's promise survives.
`<Button as="heading">` is not: a focusable heading with a tap handler is
meaningless on both targets. So the accepted set narrows per component rather
than being a global `Role`:

```ts
type ButtonProps  = { as?: 'button' | 'link'; … }
type HeadingProps = { as?: 'heading' | 'none'; … }
```

Polymorphism that cannot break the invariant it is overriding.

**And the package already does this.** `For` and `Index` take an `as` today,
through `ContainerProps`:

```ts
/** Render rows into a real element of this tag instead of the default flow wrapper. */
as?: ElementTag
```

Same word, same meaning — *override what this component builds* — with the
accepted type narrowed to what is coherent there. That is precedent rather than
collision, and it settles the naming question. It is also already compliant with
the rule above, since it accepts a tag from the **vocabulary**, not from HTML.

Worth folding in while touching it: `buildContainer` applies `class`, `style`,
and `ref` to the container it builds but has no path for `role`, so
`<For as="view" role="list">` cannot be written. Given §5.4 that is the *correct*
way to build an accessible list, so the container needs to forward the
accessibility props too.

**There is no need for `asChild`.** Radix-style slot cloning exists to work
around React cloning elements to merge props onto a child. Nothing here clones
anything — components are plain functions returning a host node, and dropping to
`<view>` or `<text>` directly is always available and costs nothing. A problem
this runtime does not have needs no mechanism.

If an app genuinely needs a raw web tag, that is what `.web.tsx` is for (§8.3),
and having it be visibly a platform file is the point.

### 6.4 How the theme arrives

Tokens reach components through context (§9.1). One consequence is worth
stating because it is load-bearing: a component runs exactly once and therefore
reads context exactly once, so the theme is a **signal**, not a value. That is
what makes a live dark-mode switch work with no re-render and no invalidation
machinery — the same rule as every other reactive value in the package.

The open fork belongs with the style note rather than here: whether tokens
resolve to style objects (portable, works on every host) or to classes (cheaper
on the web, meaningless on the memory host, a different mechanism again on
Lynx). The portable default is style objects with classes as a web-only
optimisation — but that is a style decision and it is not made in this note.

---

## 7. The primitives, one at a time

The semantics layer is necessary and not sufficient. Each of the five tags has
somewhere it diverges.

### 7.1 `text` — inheritance is the divergence

CSS inherits `color` and `font` into descendants. Yoga does not: on a native
target a `text` nested in a styled `view` inherits nothing, while a `text`
nested in another `text` does. So this renders two different ways today, and the
browser is the one that flatters you:

```tsx
<view style={{ color: 'red' }}>
  <text>is this red?</text>
</view>
```

Web: red. Device: not red. Nobody notices until the device build.

The rule to commit to — and to name now, even though implementing it is style
work — is **inheritance stops at a `view` boundary on every target**, which
means the DOM host's reset re-asserts the initial text properties at each
`view`. Picking the native semantics rather than the web's is the same call the
package already made with `ContainerChildren`: be strict where the strict target
is, so the permissive one cannot hide a bug.

Also missing and genuinely cross-platform: `selectable`. Web text is selectable
by default, native text is not, and neither default is wrong — but an app that
does not say which it wants gets different behaviour per target for free.

`lines` already exists and maps correctly.

### 7.2 `image` — the asset is a bundler problem, and should stay one

`src` is a string, which is right. What is unresolved is where the string comes
from: `import logo from './logo.png'` yields a URL on the web and a bundled
resource handle natively, and neither the vocabulary nor the host should try to
paper over that.

Keep `src: MaybeReactive<string>` and push resolution to the build, exactly as
§8.3 pushes `.web.tsx` there. The bundler already knows the target; the runtime
does not and should not learn. Density variants (`srcset` on the web, `@2x`
natively) fall out of the same decision — a pre-resolved string means the
bundler can pick, and the vocabulary stays at one prop.

One real gap: a native layout may need an image's intrinsic size *before* the
image loads, where the web reflows on load. That is a layout concern, so it
belongs with style, but it is worth knowing it is waiting there.

### 7.3 `input` — three things the web has that need a portable spelling

**Submit.** The web gives you Enter-to-submit inside a `<form>` for free; native
has a return key with a configurable label and an `onSubmitEditing` callback.
The portable pair is small and maps cleanly to both:

```ts
submitLabel?: 'done' | 'go' | 'next' | 'search' | 'send'
onSubmit?: NativeEventHandler<'submit'>
```

`submitLabel` is `enterkeyhint` on the web — a real HTML attribute, so the web
gets the same soft-keyboard affordance the device does — and `returnKeyType`
natively. `onSubmit` is Enter on the web and `onSubmitEditing` natively. No
`<form>` tag, no vocabulary growth.

**Autofill.** Painful to retrofit, free to design in, and it is the one input
feature users notice immediately. A shared subset maps onto web `autocomplete`
tokens, iOS `textContentType`, and Android autofill hints:

```ts
autoComplete?: 'off' | 'username' | 'password' | 'new-password'
  | 'email' | 'tel' | 'name' | 'one-time-code'
```

**`keyboard="password"` is doing two jobs, and should do one.** Today it is both
the keyboard mode and the secure-text flag. On the web those collapse into
`type=password` so the conflation is invisible; natively they are genuinely
independent — a PIN field is a *numeric* keyboard with secure entry, and today
that is unsayable. Split it:

```ts
keyboard?: 'text' | 'number' | 'email' | 'phone'
secure?: MaybeReactive<boolean>
```

This is a small breaking change, which pre-alpha explicitly allows, and it is
much cheaper now than after apps exist. It is also a good example of the
exercise paying off: the bug is only visible from the native side, and only
because the web spelling hid it.

### 7.4 Focus — the first genuinely new host methods

Focus is needed for form flow (advance to the next field), modals (trap and
restore), and error announcement. There is no path to it today short of `ref`
plus a host-specific cast.

It cannot be a prop, because focusing is an *event*, not a state — a
`focused={true}` prop has no correct meaning when the user then taps elsewhere.
So this is the one place the note proposes growing the contract:

```ts
type Host = {
  focus?: (element: HostElement) => void
  blur?: (element: HostElement) => void
  …
}
```

Optional, because a memory host has no focus concept and should not have to fake
one. That takes the contract from about fifteen functions to about seventeen,
and the justification is that no existing method can express it and every real
app needs it.

Focus trapping for modals then composes from `focusable` and §9.2, rather than
being its own feature.

### 7.5 Gestures — normalise the pointer, put recognisers on a subpath

`onTap` and `onLongPress` are the whole gesture vocabulary, and `longpress` maps
to `contextmenu` on the DOM, which is a right-click on a desktop and a long
press on touch — a decent approximation that is wrong half the time.

The portable design is two layers:

1. The **host** normalises a pointer stream to the `PointerEvent` shape in §5.3
   — Pointer Events on the web, engine touch events natively. That is the only
   part that cannot be written once, and it is already covered by
   `addEventListener`, so the contract does not grow.
2. **Recognisers** — pan, swipe, pinch — are pure math over that stream and live
   on a `/gestures` subpath, per the rule that a feature only some apps need
   goes on a subpath. Written once, they run everywhere by construction.

Hover is the other direction and needs honesty rather than machinery:
`onHoverIn` / `onHoverOut` that never fire on a touch-only target. The API
should make it obvious that a hover-only affordance is a design bug, not a
platform difference to be smoothed over.

### 7.6 `scroll-view` — and a naming collision to fix before it ships

`direction` on `scroll-view` means the scroll axis. But `direction` is also the
name of text direction — RTL — which is a real cross-platform concern that will
want a prop on `CommonProps`, and CSS has already claimed the word for the
second meaning. Rename the scroll axis to `axis` now, while there is nothing to
break.

Beyond that: `onScroll` needs the normalised offset from §5.3 or it is
unwritable once, and imperative `scrollTo` needs the same argument `focus` did
in §7.4 — though it can wait, since it is less universally needed.

---

## 8. Saying "these two targets differ"

### 8.1 `platform`

`Host` grows one optional **field** — not a function, so the porting budget is
untouched:

```ts
type Host = {
  /** How this target names itself. Absent means 'unknown'. */
  readonly platform?: string
  …
}
```

and the runtime exposes the two things apps reach for:

```ts
import { platform } from '@amritk/mini-native'

platform.os                                       // 'web' | 'lynx' | 'memory' | …
platform.select({ web: 12, native: 16, default: 14 })
```

### 8.2 Not a capability registry, yet

Branching on a capability (`canHover`, `hasBackButton`, `isAddressable`) beats
branching on an OS name, because the OS name is a proxy for the thing you
actually care about and proxies rot. But designing the flag set before any real
branch exists is speculation, and this repo's rule is that a feature only some
apps need has to justify itself first. Revisit once there are three real call
sites — the right flags will be obvious then and are guesswork now.

### 8.3 Whole-component divergence is a bundler concern

`.web.tsx` / `.native.tsx` needs no code today — Vite resolves it with
configuration:

```ts
resolve: { extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', …] }
```

Document that; do not build it. If it later earns a plugin, it belongs next to
`mini`'s existing Vite plugin rather than in the runtime.

### 8.4 `Host.environment`

```ts
type HostEnvironment = {
  readonly colorScheme: ReadonlySignal<'light' | 'dark'>
  readonly dimensions: ReadonlySignal<{ width: number; height: number }>
  readonly safeArea: ReadonlySignal<{ top: number; right: number; bottom: number; left: number }>
}
```

Optional on `Host`, with static fallbacks when a host omits it, so the memory
host stays a dozen lines and no existing host breaks. The DOM host wires
`matchMedia`, a resize listener, and the `env(safe-area-inset-*)` custom
properties; Lynx wires its own.

This matters more than its size suggests: safe area, viewport, and colour scheme
are exactly what an app would otherwise branch on by OS name. A good environment
API is what keeps §8.1 from being reached for.

---

## 9. Composition seams write-once needs

### 9.1 Context — and why this package needs what `mini` refuses

`mini` rejects context deliberately:

> **Composition is explicit** — no runtime plugin registry […] and no
> context/provide-inject; dependencies are prop-drilled.

That is right for a byte-budgeted embed widget. It is wrong here, and the reason
is specifically cross-platform: **the things that vary by platform — theme,
insets, navigation, locale, colour scheme — are exactly the things you do not
want in a component's signature.** Prop-drill them and every intermediate
component grows a platform-shaped prop it does not use, which is write-once
eroding one signature at a time. A component that takes `insets` as a prop is
already a component that knows it might be on a phone.

The audit already argues the mechanism fits:

> A scope-keyed provide/inject built on `effectScope` fits the model and is
> small.

One consequence falls out of the runtime and is worth writing down: **components
run exactly once, so a context value is read exactly once.** A context that must
change over time therefore holds a *signal*, not a value. That is not a
limitation to work around — it is the same rule as every other prop in the
package, and it means context needs no invalidation machinery at all.

### 9.2 Portal, without a host method

Modals, sheets, toasts, and tooltips all need to escape their parent, on both
targets. The tempting design is a host-provided overlay root, which means a new
host method and a per-target answer to "where is the top".

The cheaper design fits the repo's existing rule better: `Portal` takes an
explicit target `HostElement`, and the app provides its overlay roots from its
entry point. Composition is explicit, the contract does not grow, and the app —
which already knows its own shell — answers the question the host would have had
to guess at.

### 9.3 Error boundaries

A throw during a component's single run leaves a partially built tree. The
cross-platform angle is the failure mode: on the web that is a blank div and a
console error, on device it is a dead app. Mostly orthogonal to this note, but
the native cost is high enough that it should not sit behind the ergonomics
work.

---

## 10. Web-only obligations

These have no native counterpart, so they cannot be written once — they are
extra surface the web target owes and the native target ignores. Naming them
matters because otherwise they get discovered late, in the shape of "we can't
ship the web build".

- **Document title and meta.** A router-adjacent concern; the native target
  no-ops.
- **Scroll restoration** on back/forward. The browser does some of this and
  fights you for the rest; a native stack restores by construction.
- **URL as state.** Deep links exist on both, but only the web needs the URL to
  be *continuously* correct rather than an entry point.
- **RTL.** Actually not web-only — both targets need it, which is why §7.6
  wants the `direction` name back.

## 11. App entry

Already correct and worth stating as a rule rather than an accident: the entry
point is the *only* place that calls `setHost`, and it is the sanctioned place
for divergence.

```ts
// main.web.ts
setHost(createDomHost())
mount(domRoot(document.body), App)

// main.lynx.ts
setHost(createLynxHost())
mount(lynxRoot(), App)
```

Everything above `App` is shared. Anything else calling `setHost` is a bug, and
that is cheap to lint for.

## 12. Why style is the hard half

"Add style later" is right as sequencing and wrong as difficulty. Everything
above is additive: new props, new optional host fields, one pair of optional
host methods, no behaviour change to anything that exists. Style is not, because
the two targets do not agree on what an element *is* before you write a single
declaration:

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
a real decision with real weight, and it deserves its own note.

The upside of doing semantics first is that the reset then has a fixed target:
you are resetting `<button>`, `<a>`, `<ul>`, and `<h1>` — a known, finite set —
instead of guessing.

## 13. Keeping it honest

The failure mode for cross-platform is silent drift: the web target keeps
working while the native one quietly stops matching, because nobody ran it. This
repo already prefers structural tests for exactly this class of problem
(`import-boundary.test.ts`, `core-size-budget.test.ts`), and the same trick
applies here — twice.

**A parity suite.** One directory of component fixtures, each rendered through
all three hosts, asserting the *semantic* outcome rather than the markup: role,
accessible name, focusability, state, and the normalised payload of every event
in §5.3. `serialize-memory-tree.ts` already gives the shape for the memory side.
A role that lands on the DOM and not on Lynx fails the suite instead of failing
on a device.

**An unconsumed-prop test**, which is the more interesting of the two because it
is mechanical. Walk every prop in `ElementProps`, render it on every host, and
assert that no host let it through as a raw attribute. A prop no host consumes
is a documented lie — and the audit found four of them at once:

> **1.7 The DOM preview does not preview four documented props**

That was found by hand. It is checkable by machine, and a vocabulary this small
is exactly the size where that is worth doing.

## 14. Prior art, and the one bet this package cannot copy

Nothing above is novel, and a design note that does not say what it is
downstream of is hiding something.

**React Native Web** is the existence proof. It established most of what §5 and
§6 propose — role-driven element selection, a reset stylesheet to make CSS
behave like Yoga, a component layer over primitives — and it works at
Twitter-scale. Its two lasting complaints are worth pre-empting: the bundle is
large because it carries RN's whole surface whether you use it or not, and it is
perpetually chasing an upstream API it does not own. Neither applies here — the
vocabulary is five tags and this repo owns all of it.

**React Strict DOM** is the serious counter-bet, and the note is weaker for not
having engaged with it. It inverts the inversion: write standard HTML tags and a
CSS subset, compile *down* to native. The argument is strong. The web
vocabulary is vastly better specified than any invented native one, every
accessibility tool already understands it, every developer already knows it, and
"the lowest common denominator of native toolkits" is a set somebody has to
invent and then defend — which is exactly what §5 through §7 spend their length
doing.

The usual reason to wave it off is that **React Strict DOM needs a compiler**,
and this package's charter is compilerless — no build-step transform beyond the
standard JSX one. That is true of React Strict DOM specifically and too coarse
as an argument, because most of what it does would in fact run at runtime. §15
takes the counter-bet seriously and works out what an HTML-first version of
*this* package would look like, what it would buy, and where it would actually
break.

**Tamagui** is the other end of that trade: an optimising compiler plus its own
token and component system, buying a lot of performance and ergonomics for a
build step. Its useful lesson for §6 is that the design-system layer is where
users actually feel the value, and that shipping tokens is a much larger
commitment than shipping components.

**Dominative and the Solid-native experiments** are the closest architectural
siblings — fine-grained reactivity, no virtual tree, a pluggable host — and they
confirm the cheap part of this note: the runtime really does port for almost
nothing. Everything expensive here is vocabulary and semantics, not rendering.

The pattern across all of them: everyone who attempted write-once ended up
needing a layout reset, role-based semantics, and a token system. Most also
ended up needing a compiler. This package can have the first three and must not
have the fourth, which is the constraint the style note in (11) has to design
against.

## 15. The other direction: HTML as the source vocabulary

§14 waves this away with "React Strict DOM needs a compiler, and this package is
compilerless". That is too coarse to be useful, and the more careful version
changes the answer's shape.

### 15.1 The compiler is the price of CSS, not of HTML

Split the question in two.

**Element mapping is entirely runtime.** `create-dom-host.ts` already carries a
`HTML_TAGS` table turning the vocabulary into HTML. An HTML-first design is that
table read backwards, in the Lynx host:

```ts
const LYNX_TAGS: Record<string, string> = {
  div: 'view', section: 'view', article: 'view', form: 'view',
  nav: 'view', header: 'view', footer: 'view', main: 'view',
  ul: 'view', ol: 'view',
  span: 'text', p: 'text', li: 'text', a: 'text',
  h1: 'text', h2: 'text', h3: 'text', h4: 'text', h5: 'text', h6: 'text',
  button: 'view', img: 'image', input: 'input', textarea: 'input',
}
```

plus the roles each tag implies (`nav` → landmark, `button` → button, `h2` →
heading depth 2). No compiler anywhere.

**Style mapping splits again.** A style *object* needs no compiler either — it is
key mapping, and `to-style-text.ts` already does the hard part. `StyleValue` is
deliberately a `Record` with no `cssText` arm:

> Unlike the web there is no `cssText` string form here, because a native host
> has no CSS parser to hand a string to.

What genuinely needs a compiler is **CSS as authored syntax**: the cascade,
selectors, `:hover`, media queries, inheritance. StyleX exists mostly to extract
atomic classes on the web and hand native plain objects with no runtime parsing.

So the accurate claim is narrower than §14's: *the compiler is the price of
CSS-the-syntax, not of HTML-the-vocabulary.* An HTML-shaped authoring surface
with style objects is compilerless and could be built here.

### 15.2 What it would buy, and it is not nothing

**The DOM host nearly vanishes.** `createElement` becomes
`document.createElement(tag)`. The web target stops being a mapping table
somebody has to keep honest and becomes correct by construction.

**§5 mostly evaporates.** No `role` prop, no role table, no static-versus-
reactive question, no `alt`-versus-`label` duplication. Semantics arrive with the
tag, which is what tags are for.

**Existing tooling works on the source.** Accessibility linters, testing-library
queries, browser devtools, designer handoff, pasteable markup, and every model
and developer already knowing the vocabulary. That last one is worth more than
it sounds.

**Migration becomes incremental.** An existing web app can move screen by screen.
If that is the situation, it is close to decisive.

### 15.3 What it costs

**The subset problem relocates rather than disappearing.** HTML has north of a
hundred elements and Lynx can honour perhaps twenty. `<table>`, `<select>`,
`<details>`, `<dialog>`, `<video>`, `<canvas>`, `<svg>` — each needs a line
drawn and defended. You still invent a subset; you spell it with familiar names.
The invention cost is a wash and the familiarity is a real gain, so this is the
weakest of the three objections — but it does mean HTML-first is not the
"standard vocabulary" it appears to be.

**HTML's permissiveness cannot be honoured natively.** `<div>hello</div>` is
perfectly good HTML and a blank screen on Lynx, where a text run must live inside
a `text` element. Today that is a compile error by design:

> Bare strings and numbers are deliberately absent, and that is the whole point
> of the type existing […] Making it a compile error is the only place to catch
> it honestly.

HTML-first has to pick one of three, and none is free:

1. **Auto-wrap at runtime**, in `appendChildren`, when the parent maps to a
   container. Compilerless and it works — at the cost of inserting a node you did
   not write, on the target where node count *is* the performance problem, with a
   rendered tree that no longer matches your source.
2. **Keep the compile error**, so `<div>` rejects a string. Then it is HTML in
   name only and the first line every developer writes fails.
3. **Wrap statically in a compiler** — no runtime cost, visible in the output.

Option 3 is plainly the best, which is where the compiler stops being optional.
It is not needed for the tags; it is needed for HTML's *content model*.

**False friends, which is the real objection.** A `<div>` that defaults to
`flexDirection: column`, does not cascade `color` to its descendants, has
`flexShrink: 0` and clips its overflow is not a div. Put the two designs side by
side:

> The current vocabulary has **unfamiliar names with honest semantics**.
> HTML-first has **familiar names with unfamiliar semantics**.

The second is far more inviting and fails later, more quietly, and only on
device. React Strict DOM absorbs exactly this with a documented subset, lint
rules, a compiler, and a large team enforcing all three. A small package has
thinner defences, and §12's table is the list of things that would silently
differ.

**It makes §5.4 worse, not better.** The flow-wrapper hazard does not go away —
`<ul><For>…</For></ul>` still interposes a wrapper — but the escape hatch does.
With a vocabulary you can build `div role="list"` and dodge the content model
entirely; with HTML you wrote `<ul>`, and `<ul>` means what it means. More
generally: HTML has content models everywhere and the five-tag vocabulary has
almost none, so HTML-first is the design that *wants* a build-time content-model
check — which is the same compiler again, arriving from a third direction.

### 15.4 Where this actually lands

The choice is downstream of a question this note cannot answer:

**Which target are you migrating from?**

- **From a web app, wanting it on device** → HTML-first is right, and you should
  seriously evaluate React Strict DOM before building your own. That is the
  problem it was built for and it has a compiler, a subset, and Meta's tooling
  behind it.
- **Building a native-shaped app that also ships a good web build, compilerless,
  with a small surface** → the native vocabulary, which is the current design.
- **If a compiler ever becomes acceptable**, the calculus flips hard, and it is
  worth knowing exactly what one buys: static text wrapping, real CSS authoring,
  content-model validation at build (which catches §5.4's hazard mechanically
  rather than by a rule in a document), dead-style elimination, and `.web.tsx`
  resolution for free. That is a lot. It is also a different project.

There is a middle path worth naming, because it captures most of the ergonomic
win with none of the false friends: **keep `view` and `text` as the intrinsics,
and let `/ui` (§6) carry the familiar names.** `<Stack>`, `<Text>`, `<Heading>`,
`<Button>`, `<List>` are recognisable to anyone who has written a component in
the last decade, they are where a design system wants to live anyway, and they
sit on primitives that never pretend to be HTML. Authors get a familiar surface;
the runtime keeps an honest one; there is no second vocabulary to maintain.

That is not a compromise position so much as the observation that §6 already
absorbs most of what HTML-first was going to buy.

## 16. What this design costs

Every proposal above has a bill, and they are worth writing down next to the
benefits rather than being discovered later.

**Static `role` means conditional semantics rebuild.** `role` cannot be a getter,
so `<view role={isLink() ? 'link' : 'button'}>` is unsayable and the honest
answer is `Dynamic`, which rebuilds the subtree and loses focus and scroll
position inside it. Rare in practice — a thing does not usually change what it
*is* — but when it happens the workaround is visibly worse than a reactive prop
would have been.

**`<button>` cannot be statically constrained.** §5.4 rescues lists by dropping
to `div role="list"`, but `<button>` is a genuine trade rather than a clean win.
It buys real focus order, real Enter and Space activation, and real form
submission. It costs a content model — no interactive descendants — that
TypeScript cannot enforce on `children`, so `<Button><Link/></Button>` typechecks
and produces broken HTML. React Native Web resolves this by using `div` +
`role="button"` everywhere and re-synthesising activation, accepting a permanent
tax on keyboard correctness in exchange for never being invalid. The
recommendation here goes the other way — take the real element, catch the
violation in the validation suite (§13) — but it is a judgement call, not an
obvious one, and it is the single place this note most deserves an argument.

**Normalised events lose information.** A framework-defined `TapEvent` of
`{ x, y }` is portable precisely because it discards everything target-specific.
An app that needs modifier keys on the web, or force on a device, has to reach
past it, and there is currently no seam for that. `NativeEventMap` still exists
for events the vocabulary does not name, but the named ones would need a
deliberate escape — a `raw` field, most likely, which immediately becomes the
non-portable hole the whole idea was avoiding.

**`/ui` version-couples the design system to the framework.** Shipping semantic
components means a design system built on them upgrades on this package's
schedule. That is the price of centralising the correctness knowledge, and it is
the reason §6.1 draws the line where it does: the smaller `/ui` stays, the less
that coupling costs.

**The parity suite proves meaning, not appearance.** It can assert that a button
has the right role and name on all three hosts. It cannot assert that the button
looks like a button, and the divergences in §12 are exactly the ones it will not
catch. Screenshot testing on two targets is the only thing that would, and that
is a much larger commitment than this note is proposing.

**Pre-alpha corrections are cheap now and never again.** `axis`, `secure`,
`selectable`, `alt` → `label`, and the `role`-forwarding in `buildContainer` are
all trivial today and all breaking. They are listed at (5) in the order of work
for that reason alone.

## 17. Order of work

1. **The semantics layer** — `role`, `level`, `label`, `hint`, `focusable`,
   state props; role-driven element construction in the DOM host; the native
   mapping in the Lynx host; `alt` folded into `label`. Closes the audit's number
   one native gap and the number one web gap together. Ships with the two things
   §5.4 forces: `role="presentation"` on every flow wrapper, and accessibility
   props forwarded through `buildContainer`.
2. **Normalised event payloads** (§5.3). Independent of (1), similar size, and
   the thing that blocks write-once soonest in practice.
3. **Operable tappables.** Falls out of (1) almost entirely.
4. **The parity suite and the unconsumed-prop test**, alongside (1) and (2)
   rather than after them.
5. **The small vocabulary corrections** — `axis` for the scroll direction,
   `secure` split from `keyboard`, `selectable` on `text`. All pre-alpha
   breaking changes that get more expensive every week.
6. **`/ui`** — `Text`, `Heading`, `Button`, `Link`, `Stack`, `List`, and the
   narrowed `as` override. Pure composition over (1) and (3), so it needs no
   runtime work of its own, and it is where the typography semantics get pinned
   before a design system starts depending on them.
7. **`platform.os` / `platform.select`**, and the documented `.web.tsx`
   convention.
8. **`Host.environment`** — colour scheme, dimensions, safe area. Unblocks
   `Screen` in (6) and most of the pressure on (7).
9. **Focus** (`Host.focus` / `blur`, `autoFocus`), then **context** — which is
   what lets the theme reach (6) without prop-drilling — then **portal**.
10. **Input completeness** — `submitLabel` / `onSubmit`, `autoComplete`.
11. **Style**: the layout reset, then tokens and the type scale behind (6). Its
    own design note.
12. Navigation, gestures subpath, error boundaries.

Steps 1 through 8 change no existing behaviour beyond the deliberate
corrections in (5), and `Host` grows two optional fields and no methods. The
first method it grows is in (9).
