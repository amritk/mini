import type { IntrinsicElements as LynxIntrinsicElements, StandardProps } from '@lynx-js/types'

import type { ContainerChildren, MaybeReactive, MiniChildren } from '../types'
import type { MiniProps } from './mini-props'

/**
 * The JSX element vocabulary: every tag Lynx's engine builds, typed from Lynx's
 * own declarations.
 *
 * ## Why this is derived rather than written
 *
 * Lynx already ships the answer. `@lynx-js/types` declares `IntrinsicElements`
 * — thirty-three tags — over per-element prop interfaces built on a shared
 * `StandardProps`, and a `LynxEventProps` carrying every event in all five
 * binding forms (`bindtap`, `catchtap`, `capture-bindtap`, `capture-catchtap`,
 * `global-bindtap`). Transcribing two hundred and forty attributes by hand
 * would produce a snapshot that is wrong the day the engine ships a new one,
 * and wrong in the silent direction: an attribute this package had not heard of
 * would be a compile error on a capability the engine already has.
 *
 * So this file MAPS over that map instead. Three consequences follow, and all
 * three are the point:
 *
 * - A new engine attribute needs no release here. An app that bumps
 *   `@lynx-js/types` gets it, because the props are read out of the package the
 *   app installed rather than out of a copy taken at our release time.
 * - The engine's documentation is this runtime's documentation. Attributes are
 *   spelled exactly as the engine spells them (`text-maxline`,
 *   `scroll-orientation`, `bindtap`), so there is no translation table and no
 *   second spelling for a prop to be lost between.
 * - The vocabulary cannot drift from the engine by accident, only by someone
 *   editing this file.
 *
 * `@lynx-js/types` is an OPTIONAL, types-only peer dependency. It has no
 * runtime and ships nothing but `.d.ts`, so an app that never names a tag pays
 * nothing for it.
 *
 * ## What this layer adds
 *
 * Exactly two things, and no third:
 *
 * 1. {@link MiniProps} — `ref`, `show`, `key`, and our wider `style` / `class`.
 * 2. Reactivity. Every non-event prop becomes `MaybeReactive`, which is the
 *    whole reactivity rule of a compilerless JSX: a function tracks, anything
 *    else is applied once. See {@link Reactive}.
 *
 * ## Conflicts adjudicated here
 *
 * The published docs and the shipped types disagree in a handful of places. The
 * rule throughout is **follow the shipped types**, because the types are what
 * the engine team maintains alongside the engine and the docs lag. Each one is
 * named again at its tag; the list is here so it can be audited in one place:
 *
 * - `accessibility-traits`, not `accessibility-trait`. The docs' own heading
 *   says the singular; the code block directly beneath it and the types both
 *   say the plural. The types also enumerate fifteen values where the docs list
 *   four.
 * - `text-maxline` is a `string`. The docs' code block declares `number`.
 * - `pan-intercept-direction` is `0 | 1` and `pan-intercept-scope` is `0`–`5`.
 *   The docs add a "none" value to each (`2` and `6`); the types do not have it.
 * - `bindclick` is documented on `view` and does not exist in the types, so it
 *   is not offered here. `tap` is the gesture that actually exists.
 * - `update-animation` (on `list`), `reuse-identifier` (on `list-item`),
 *   `accessibility-elements`, `accessibility-elements-a11y`, `a11y-id`,
 *   `global-target` and `clip-radius` are documented somewhere and declared
 *   nowhere. None is offered — a prop that reaches the engine as a dead
 *   attribute is a documented lie, and on a device it looks like a layout bug.
 * - `list-type` and `span-count` are marked Required by the docs and optional
 *   by the types. Optional wins; the engine has a default for both.
 * - `className` is dropped. It is ReactLynx's compile-time alias for `class`,
 *   and this runtime has no compiler — it would arrive at the engine as an
 *   attribute nothing reads. Write `class`.
 */
export type IntrinsicElements = {
  // ------------------------------------------------------------- core layout

  /**
   * The container, and the tag most trees are mostly made of. It declares no
   * attributes of its own — `ViewProps` is exactly `StandardProps` — so
   * everything it accepts is a global attribute.
   *
   * A `view` written inside a `<text>` joins the text layout while keeping
   * every normal container capability, which is why its children stay
   * container children there too.
   */
  view: Container<'view'>

  /**
   * The root node. At most one per page, and the framework generates one when
   * it is absent, so authoring it is unusual.
   *
   * Worth knowing: `width`, `height`, `left`, `top` and `position` cannot be
   * set on it through `style` or `class` — the host native view imposes the
   * size. The type cannot express that, so it is written here instead.
   */
  page: Container<'page'>

  /**
   * A grouping node that takes part in neither layout nor the accessibility
   * tree.
   *
   * HAND-WRITTEN, because `@lynx-js/types` does not declare it even though the
   * engine builds it (`__CreateWrapperElement`). It is the slot every
   * control-flow component owns: a `view` there would silently turn a `For`
   * inside a flex row into one flex item instead of many, and would sit between
   * a list and its items in the accessibility tree.
   *
   * It gets no `style`, `class` or `show`, and that is not an oversight — an
   * element outside layout has nothing for any of the three to do, and offering
   * them would only invite someone to style the one node that cannot be styled.
   */
  wrapper: WrapperProps

  // --------------------------------------------------------------- text runs

  /**
   * The inline formatting context. Its children are {@link MiniChildren}
   * rather than container children, which is the one place a bare string is
   * legal: a run of text is a `raw-text` ELEMENT in Lynx and it may only live
   * inside a `<text>`.
   *
   * CONFLICT: `text-maxline` is typed `string` here because the shipped types
   * say so, though the docs' code block says `number`. Pass `'2'`, not `2`.
   */
  text: Inline<'text'>

  /** A `text` nested inside another `text`. Same props, same children. */
  'inline-text': Inline<'inline-text'>

  /**
   * The element that actually carries a literal string.
   *
   * Normally the runtime builds these for you — a string or a reactive getter
   * inside a `<text>` becomes one — but it is a real tag and authoring it
   * directly is how a text run gets its own attributes or its own `ref`.
   *
   * `@lynx-js/types` declares it inline (`StandardProps & { text: … }`) rather
   * than as a named interface, so the indexed access below is what picks it up.
   * It is a leaf: the string lives in the attribute, not in children.
   */
  'raw-text': Leaf<'raw-text'>

  /**
   * The content shown at a `<text>`'s truncation point, in place of an
   * ellipsis. May itself hold `text`, `image` and `view`.
   *
   * CONFLICT of a mild kind: the types give it `NoProps` — no attributes at all
   * — while the docs describe it as ordinary content. The types win, so it
   * accepts children and nothing else.
   */
  'inline-truncation': Container<'inline-truncation'>

  // ------------------------------------------------------------------ images

  /**
   * A leaf. It needs a non-empty `src` plus either non-zero `width`/`height` or
   * `auto-size`, or it lays out at zero and looks like a missing element.
   */
  image: Leaf<'image'>

  /** An `image` nested inside a `<text>`. Same props. */
  'inline-image': Leaf<'inline-image'>

  /**
   * An image that can carry a blur or a drop shadow drawn into its padding.
   *
   * Undocumented on the website — everything known about it comes from the
   * shipped types. Note its `load` and `error` payloads nest under `detail`,
   * where plain `image`'s put the same fields at the top level.
   */
  'filter-image': Leaf<'filter-image'>

  // -------------------------------------------------------------- scrollers

  /**
   * The plain scroller. Direct children only honour `linear` and `sticky`
   * layout, so the usual shape is a single wrapper `view` inside it.
   */
  'scroll-view': Container<'scroll-view'>

  /**
   * The recycling scroller, and the one to reach for when a collection is long
   * enough that building every row would cost. Needs a fixed width and height,
   * and `list-item` is its only legal direct child.
   */
  list: Container<'list'>

  /**
   * The only legal direct child of a `list`.
   *
   * `item-key` is REQUIRED, and it stays required here because the shipped
   * types make it so — it is the identity the engine diffs and recycles on, and
   * a missing one is a list that reuses the wrong row. Note it is a different
   * thing from JSX's `key`, which this runtime ignores.
   */
  'list-item': Container<'list-item'>

  /** A row grouping inside a `list`. Types-only; no docs page, no attributes of its own. */
  'list-row': Container<'list-row'>

  // ---------------------------------------------------------------- controls

  /**
   * Single-line text input. An XElement, so it needs client-side integration
   * before it renders at all.
   *
   * Careful with `bindfocus` / `bindblur`: `InputProps` omits the global,
   * payload-free versions and declares its own carrying `{ value }`. That is
   * the shipped shape and the one this vocabulary hands through.
   */
  input: Leaf<'input'>

  /**
   * Multi-line text input. Same surface as `input` bar three differences worth
   * remembering: no `'password'` in its `type` union, an extra `maxlines` and
   * `line-spacing`, and `confirm-type` defaults to `'done'` rather than
   * `'send'`.
   */
  textarea: Leaf<'textarea'>

  // ------------------------------------------------------------- XElement UI

  /**
   * A container promoted out of the document flow into its own rendering layer.
   * It occupies no space, must be `position: fixed`, and takes EXACTLY ONE
   * direct child — a cardinality the type cannot express, so it is written
   * here.
   *
   * The docs' own guidance is to prefer `position: fixed` in a page built
   * entirely in Lynx and keep this for genuinely host-level layers.
   */
  overlay: Container<'overlay'>

  /**
   * Pull-to-refresh, vertical only. Takes up to two direct children: a
   * `refresh-header` and one vertically scrollable element.
   */
  refresh: Container<'refresh'>

  /** The header revealed by a `refresh` drag. No attributes of its own. */
  'refresh-header': Container<'refresh-header'>

  /** Horizontal paging container. Its direct children must be `viewpager-item`. */
  viewpager: Container<'viewpager'>

  /** A single page of a `viewpager`. No attributes of its own. */
  'viewpager-item': Container<'viewpager-item'>

  /**
   * Coordinated nested scrolling — the sticky-header-plus-tabs-plus-inner-list
   * shape. Its children are the three sub-elements below, and the layout
   * invariant is that its height equals the slot's height plus the toolbar's.
   */
  'scroll-coordinator': Container<'scroll-coordinator'>

  /** The collapsing header of a `scroll-coordinator`. Positioned absolutely. */
  'scroll-coordinator-header': Container<'scroll-coordinator-header'>

  /** The scrollable slot of a `scroll-coordinator`. */
  'scroll-coordinator-slot': Container<'scroll-coordinator-slot'>

  /** A draggable slot variant. Types-only and undocumented; its one attribute is `enable-drag`. */
  'scroll-coordinator-slot-drag': Container<'scroll-coordinator-slot-drag'>

  /** The pinned toolbar between a `scroll-coordinator`'s header and its slot. */
  'scroll-coordinator-toolbar': Container<'scroll-coordinator-toolbar'>

  /** Backdrop blur — the equivalent of `backdrop-filter`. To blur the element itself, use CSS `filter`. */
  'blur-view': Container<'blur-view'>

  /** A draggable window region, analogous to the web's `app-region`. Clay desktop only. */
  'title-bar-view': Container<'title-bar-view'>

  // -------------------------------------------------------- embedded content

  /**
   * Embeds another Lynx page, like an `iframe`. `src` is REQUIRED — the shipped
   * type declares it non-optional, and a frame without one has nothing to show.
   */
  frame: Leaf<'frame'>

  /**
   * Renders an SVG document supplied as a string through `src` or `content`.
   *
   * A LEAF from Lynx's point of view, which is the surprising part: the SVG's
   * own tags are parsed out of that string and are NOT JSX intrinsic elements.
   * Adding `<circle>` and friends here would promise a nesting the engine never
   * accepts.
   */
  svg: Leaf<'svg'>

  /** An embedded web view. Needs a fixed width and height, and does not nest inside other scrollers. */
  webview: Leaf<'webview'>

  /**
   * Renders markdown, with streaming and typewriter support. `content` is
   * required.
   *
   * Types-only and undocumented, and it carries the one genuinely odd naming in
   * the whole vocabulary: its events use camelCase suffixes — `binddrawStart`,
   * `bindimageTap`, `bindparseEnd` — where every other Lynx event is lower
   * case. That is transcribed from the shipped types literally, not tidied up.
   */
  markdown: Leaf<'markdown'>

  /**
   * Online video. Experimental upstream, and new in `@lynx-js/types@4.1.0`.
   *
   * On an older `@lynx-js/types` — the declared peer floor is `4.0.0` — the tag
   * still exists and still accepts every global attribute, but its own props
   * (`src`, `loop`, `muted`, …) are not known. See {@link LynxProps}.
   */
  video: Leaf<'video'>

  // --------------------------------------------------------------- internals

  /**
   * Lynx's own component instantiation.
   *
   * Present for completeness because the engine declares it, but note that this
   * runtime does not drive Lynx's component system — it owns the whole tree and
   * has its own composition model, which is why `createElement` always passes a
   * parent component id of `0`. `ComponentProps` also carries an
   * `[key: string]: any` index signature, so this is the one tag where a
   * misspelled attribute is not a compile error.
   */
  component: Container<'component'>
}

// ---------------------------------------------------------------------------
// The derivation
// ---------------------------------------------------------------------------

/**
 * A prop name that carries a HANDLER rather than a value.
 *
 * Lynx binds an event by prefixing its name, and the prefix decides phase and
 * propagation: `bind` bubbles, `catch` bubbles and intercepts, `capture-bind`
 * and `capture-catch` are the same pair going down, and `global-bind` listens
 * across components. `main-thread:` may precede any of them.
 *
 * This exists so {@link Reactive} can leave those props alone. Wrapping a
 * handler in `MaybeReactive` would make `bindtap={() => …}` ambiguous with a
 * reactive getter that RETURNS a handler, and the runtime decides
 * static-versus-reactive by asking whether the value is a function — so both
 * readings are functions and the handler would win by accident rather than by
 * design. Keeping the two apart in the type is what makes the runtime rule
 * legible: on an event prop a function is the handler, everywhere else a
 * function is a subscription.
 *
 * The `main-thread:` arm is deliberately here even though no Lynx props type
 * declares such a key today. `apply-prop.ts` accepts and strips the prefix — on
 * a runtime that already drives the PAPI from the main thread,
 * `main-thread:bindtap` and `bindtap` are the same listener — so if the package
 * ever declares those keys they must not be wrapped either.
 */
type EventKey =
  | `bind${string}`
  | `catch${string}`
  | `capture-bind${string}`
  | `capture-catch${string}`
  | `global-bind${string}`
  | `main-thread:${string}`

/**
 * Makes every value prop static-or-reactive, and leaves handler props alone.
 *
 * A signal is a zero-argument function, so passing one WITHOUT CALLING IT is
 * already a live binding — `disabled={busy}` tracks forever while
 * `disabled={busy()}` freezes the value at creation. That is the single footgun
 * of a compilerless JSX, and `bun run check:reactivity` exists to catch it.
 *
 * Two details of the mapping matter:
 *
 * - It is HOMOMORPHIC (`[Key in keyof Props]`, with no `?` of its own), so
 *   optionality comes through from Lynx unchanged. That is what keeps
 *   `list-item`'s `item-key`, `frame`'s `src` and `markdown`'s `content`
 *   required — they are required in the engine, and re-marking every prop
 *   optional would have thrown that away.
 * - `NonNullable` strips the `undefined` an optional prop's type carries before
 *   the union is built, so the getter arm stays `() => string` rather than
 *   `() => string | undefined`. The prop is still optional; it just cannot be
 *   handed an explicit `undefined`, which is what `exactOptionalPropertyTypes`
 *   asks for repository-wide.
 */
type Reactive<Props> = {
  [Key in keyof Props]: Key extends EventKey ? NonNullable<Props[Key]> : MaybeReactive<NonNullable<Props[Key]>>
}

/**
 * The props Lynx declares for a tag.
 *
 * Indexed access into the package's own `IntrinsicElements` rather than
 * twenty-five named imports, because that map IS the list of tags — importing
 * the interfaces one by one would mean maintaining a second copy of it here,
 * which is the copy that goes stale.
 *
 * The fallback arm handles version skew inside the declared peer range: a tag
 * added in a later `@lynx-js/types` (`video`, in `4.1.0`) still resolves to the
 * global attributes on an older one. So an app on the floor of the range gets a
 * usable tag with fewer known attributes, rather than a compile error in this
 * package's own source.
 */
type LynxProps<Tag extends string> = Tag extends keyof LynxIntrinsicElements
  ? LynxIntrinsicElements[Tag]
  : StandardProps

/**
 * The props Lynx declares for a tag that we do NOT take verbatim.
 *
 * `style` and `class` are re-declared by {@link MiniProps} because we accept
 * wider values; an intersection would have made the wider arms unreachable, so
 * the package's versions have to come out first. `className` is dropped
 * outright — it is ReactLynx's compile-time alias for `class`, and there is no
 * compiler here to resolve it.
 */
type OverriddenProp = 'style' | 'class' | 'className'

/** One tag's full prop surface: Lynx's own, made reactive, plus what this runtime adds. */
type ElementProps<Tag extends string> = Reactive<Omit<LynxProps<Tag>, OverriddenProp>> & MiniProps

/**
 * A tag that holds elements.
 *
 * Bare strings and numbers are deliberately absent from {@link ContainerChildren},
 * and that absence is the whole point: Lynx has no notion of loose text inside
 * a container, so `<view>hello</view>` builds a tree the engine will not render
 * and the screen comes up silently blank. There is no preview target here to
 * catch that later, and on a device it reads as a layout bug rather than a
 * content one, so it is a compile error instead.
 */
type Container<Tag extends string> = ElementProps<Tag> & { children?: ContainerChildren }

/** A tag that establishes an inline formatting context, where a bare string IS legal. */
type Inline<Tag extends string> = ElementProps<Tag> & { children?: MiniChildren }

/**
 * A tag that takes no children at all.
 *
 * `children?: never` rather than an omission, so writing them is an error at
 * the call site instead of silently building a subtree the engine drops on the
 * floor.
 */
type Leaf<Tag extends string> = ElementProps<Tag> & { children?: never }

/**
 * `wrapper`'s props, hand-written because `@lynx-js/types` does not declare the
 * tag.
 *
 * The engine does build it (`__CreateWrapperElement`), and this runtime leans on
 * it for every control-flow slot, so it has to be in the vocabulary. Minimal is
 * correct here: a wrapper takes part in neither layout nor the accessibility
 * tree, which leaves nothing for a style, a class or a visibility toggle to act
 * on. `ref` and `key` are the two that still mean something.
 */
type WrapperProps = {
  ref?: MiniProps['ref']
  key?: MiniProps['key']
  children?: ContainerChildren
}
