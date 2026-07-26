# Style — the layout reset, tokens, and the type scale

The note [`mini-native-cross-platform.md`](./mini-native-cross-platform.md) put
style deliberately out of scope and said, in §12, that this is the harder half
rather than the easier one. This is that half.

It is a record of what was built and why, not a survey. Where a decision could
reasonably have gone the other way, the alternative is named and so is the
trigger for revisiting it.

---

## 1. Why style is harder than everything before it

Every piece of cross-platform work up to this point was **additive**. New props,
new optional host fields, one pair of optional host methods. Nothing that
existed behaved differently afterwards, so nothing could regress.

Style is not additive, because the two targets do not agree on what an element
*is* before a single declaration is written:

| | Native (Yoga) | Web (CSS) |
| --- | --- | --- |
| `display` | always flex | `block` |
| `flexDirection` | `column` | `row` |
| `position` | `relative` | `static` |
| `flexShrink` | `0` | `1` |
| `minWidth` / `minHeight` on a flex item | `0` | `auto` |
| text properties | do not inherit through a container | inherit |

An unstyled container with two children stacks **vertically on a device and
horizontally on the web**. That is not cosmetic. It is the difference between
write-once being true and being a slogan, and no amount of careful component
authoring above it can paper over it — every screen written before the
divergence is closed has to be revisited afterwards.

So the reset is not a nicety layered on top. It is the floor.

## 2. The reset

`hosts/dom-reset.ts` installs one stylesheet that makes a browser lay out the
way Yoga does. Three decisions in it are worth stating.

### 2.1 Zero specificity

Every rule is wrapped in `:where()`, which contributes nothing to specificity. A
single class, a `style` prop, an app stylesheet — anything at all overrides the
reset, without `!important` and without anyone counting selectors.

This matters more than it sounds. A reset that wins arguments with the code
above it is a reset people work around, and the workarounds are worse than the
divergence: `!important` in a component, a wrapper element to escape a rule, a
`:not()` selector that grows an exception every quarter. Author-origin rules
still beat user-agent ones regardless of specificity, so `:where()` costs
nothing in the one fight the reset actually has to win — undoing the browser's
own opinion about `<h1>`, `<button>`, and `<a>`.

### 2.2 Scoped by attribute, not applied globally

Every element the DOM host builds carries `data-mn`, and the reset targets that
rather than bare tag names. The cost is one attribute per element, which is
nothing next to creating the element; the benefit is that an app embedding this
runtime beside other markup does not have its own page reset out from under it.

`createDomHost({ reset: false })` declines it altogether, for a guest in a page
it does not own. That is a supported configuration, and §5 lists exactly what
you become responsible for by taking it.

The flow wrapper is deliberately **not** stamped. `display: contents` means it
has no box, so there is nothing for a box reset to reset, and a `display: flex`
rule would be in the way of the one thing that wrapper has to be.

### 2.3 Text inheritance stops at a container

This is the one rule that changes behaviour people rely on, so it deserves the
argument rather than the assertion.

CSS inherits `color` and `font` into descendants. Yoga does not: on a device a
`text` nested in a styled container inherits nothing, while a `text` nested in
another `text` inherits everything. So this renders two ways today, and the
browser is the one that flatters you:

```tsx
<view style={{ color: 'red' }}>
  <text>is this red?</text>
</view>
```

Web: red. Device: not red. Nobody notices until the device build, and by then it
is spread across every screen.

The reset picks **Yoga's semantics**, re-asserting the base text properties at
every container. That is the same call `ContainerChildren` already makes by
refusing a bare text run inside a container: be strict where the strict target
is, so the permissive one cannot hide a bug.

The base it re-asserts is a pair of custom properties (`--mn-font`,
`--mn-color`) rather than `initial`, and that is not a detail. `font: initial`
resolves to the user agent's default — a serif face at 16px — so an app that had
never heard of this file would come up in Times. The properties default to
`system-ui` and the CSS system colour `CanvasText`, which follows the platform's
light and dark surfaces without an app configuring anything, and an app that
wants a different base sets them once instead of fighting a stylesheet.

### 2.4 What the reset deliberately does not do

**It does not clip overflow.** Yoga's historic default is to clip and CSS's is
not, so this looks like an obvious seventh row in §1's table. It is left out on
purpose:

- The two native platforms do not agree with each other either — iOS and
  Android differ on what a view clips — so there is no single "native
  behaviour" to converge on.
- Clipping every container on the web silently breaks shadows, focus rings, and
  every absolutely-positioned popover that is not in a `Portal`.

That is a large behavioural claim to make on an app's behalf in order to close a
divergence which shows up as a visual difference rather than as a broken screen.
It is the app's call. *Revisit if* a real screen is found where the difference
is structural rather than cosmetic.

**It does not set a text size on containers beyond the base.** Type scale is
tokens, and tokens are §3.

## 3. Tokens

### 3.1 Style objects, not classes

This was the open fork in the cross-platform note (§6.4), and it resolves
cleanly once the question is asked in the right order.

Classes are genuinely cheaper on the web: an atomic class per declaration,
deduplicated across the whole app, no inline style attribute, and a bundler that
can drop the ones nobody used. They are also **meaningless on a headless host
and a different mechanism again on a native engine**, which means choosing them
would mean maintaining two token pipelines and a per-target answer to what a
token *is*.

A style object is the only shape every target already consumes — `StyleValue` is
a `Record` precisely because a native host has no CSS parser to hand a string
to. So:

> **Tokens resolve to style objects. Class extraction stays available later as a
> web-only optimisation.**

That ordering is the important part. A level-3 optional plugin can turn a
resolved style object into an atomic class at build time, and an app that skips
the plugin still renders correctly — slower and larger, never wrong. Had the
tokens been classes from the start, the memory and native hosts would have
needed a translation layer that could not be removed.

### 3.2 The theme is a signal

A component here runs exactly once, so it reads context exactly once. If the
context held a `Theme`, every component would hold the theme *as it was at
boot*, forever.

So `ThemeContext` holds a `ReadonlySignal<Theme>`. Every component reads the
signal once, keeps it, and goes on tracking it — which is how a dark-mode switch
reaches the whole tree with **no re-render, no invalidation pass, and no
machinery beyond the signal that was going to exist anyway**. The `theme-context`
suite pins that the element is not rebuilt: the same node, with a style mutated.

The cost is honest and worth stating: `Text` resolves its style through a
getter, so there is one effect per text element. That is the price of a live
theme in a runtime with no re-render, and it is exactly the kind of thing the
optional optimising plugin exists to collapse later — again, without changing
what an app that skips it sees.

Not providing a theme is a supported state, not a mistake. The fallback is a
real theme, so a component renders correctly on its own, in a test, with no app
around it.

### 3.3 Size and level are two props, always

The thing most typography systems get wrong, and it is unrecoverable later.

A real page needs an `h2` that renders small — a sidebar section header — and
needs large text that is not a heading at all, a hero number or a stat. Couple
size to heading level and authors start picking heading levels *by how big they
want the text*, which is precisely how a document outline stops being navigable
to a screen reader and, on the web, to a crawler.

```tsx
<Heading level={2} size="sm">Related</Heading>  // an h2 that renders small
<Text size="xl">$4,200</Text>                   // large, and not a heading
<Text size="sm" tone="muted">per seat</Text>
```

`level` drives semantics — `role="heading"` plus the depth, which the DOM host
turns into a real `<h2>` and a native host into a heading of that depth. `size`
and `tone` drive appearance and resolve against the theme.

The default keeps the common path short: `<Heading level={2}>` with no `size`
picks the scale step the theme pairs with that level, so you reach for `size`
only when a design genuinely disagrees with the outline.

Note what enforces this rather than merely documenting it: `Text` does not have
`role` or `level` on its surface at all, so a `Text` cannot become a heading by
accident.

### 3.4 Spacing is a named step

`Stack` and `Row` take `gap` as a step of the theme's scale rather than a
number. The package knows that a spacing scale should exist and that a gap
should come from it; the app decides what the steps are. Reaching for `style`
with a raw number still works and is meant to look out of place.

A stack with no `gap` resolves nothing and creates no effect — a container view
is the most common element in a native tree, and one that was asked for nothing
should cost nothing beyond the element.

## 4. What this does not close

Named so they are known rather than discovered.

**The reset is asserted, not observed.** The suite checks that the rules are
installed, scoped, and stamped onto the right elements. It cannot check that an
unstyled container then stacks its children, because happy-dom does not lay
anything out. Screenshot testing on two real targets is the only thing that
would, and that is a much larger commitment than this note is proposing.

**The parity suite proves meaning, not appearance.** It can assert that a button
has the right role, name, and reachability on all three hosts. It cannot assert
that the button looks like a button, and §1's table is exactly the class of
thing it will not catch.

**Overflow, per §2.4.**

**No animation seam.** An animation is still a bridge write per frame on a
native target. That is the next real performance question and it is orthogonal
to everything here.

**No responsive primitive.** `dimensions()` is available and branching on it
works, but there is no `@media`-shaped abstraction, deliberately — a native
target has no media queries, and inventing one before there are real call sites
would be the same speculation §8.2 of the cross-platform note declined for
capability flags.

## 5. If you decline the reset

`createDomHost({ reset: false })` is supported, and this is what becomes yours:

- Containers lay out as `display: block` with `flex-direction: row` when made
  flex, `position: static`, and `flex-shrink: 1`. §1's table is the full list.
- `<button>`, `<a>`, and `<h1>`–`<h6>` arrive with user-agent styling — which is
  the cost §5.2 of the cross-platform note predicted for building real semantic
  elements, and the reset is what was supposed to pay it.
- Text inherits through containers on the web and does not on a device.

The trade is worth taking only when this runtime is a guest in a page whose
styling you do not own. In an app you own, take the reset.

## 6. The order this was built in, and why it was not §17.4's

The cross-platform note's §17.4 says that for a **fresh codebase** the reset
comes first — before the first screen, because everything built on top cannot be
trusted until an empty container lays out identically on both targets.

That is right, and it is not what happened here, because this is the other case:
an existing package with an existing vocabulary. Semantics-first was correct for
it, and for a reason that paid off — the reset has a *fixed target*. It is
resetting `<button>`, `<a>`, `<h1>`, and `<span>`: a known, finite set produced
by a closed role table, rather than whatever the app happens to build.

Both orders are defensible. Which one applies is decided by whether the
vocabulary already exists, not by preference.
