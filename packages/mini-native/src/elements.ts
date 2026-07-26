import type { ClassValue, ContainerChildren, HostElement, MaybeReactive, MiniChildren, StyleValue } from './types'

/**
 * The element vocabulary every host renders.
 *
 * These are NOT HTML tags. A native view tree has no `<div>`, and typing the
 * JSX surface against `HTMLElementTagNameMap` would both pull the DOM library
 * into the core and promise elements no native target can produce. Instead the
 * vocabulary is a small platform-neutral set — the same handful of primitives
 * every native UI toolkit agrees on — and each host maps it onto whatever it
 * actually renders.
 *
 * That inversion is what makes the DOM host a web PREVIEW target for a native
 * app rather than the other way around: it renders `view` as a `<div>` and
 * `text` as a `<span>`, so the same component tree runs in a browser during
 * development and on a device in production.
 */
export type ElementTag = 'view' | 'text' | 'image' | 'scroll-view' | 'input'

/** The tags above as a runtime set, for hosts that want to validate a tag. */
export const ELEMENT_TAGS = ['view', 'text', 'image', 'scroll-view', 'input'] as const

/**
 * The event object each handler receives, keyed by the name the host actually
 * sees — the runtime lowercases the prop, so `onLongPress` arrives as
 * `longpress`.
 *
 * Every entry is `unknown` here on purpose, because this package cannot know
 * what an event is: that is decided by whichever host is installed, and a Lynx
 * gesture and a DOM `MouseEvent` have nothing in common. Rather than pick one
 * and be wrong on the other target, the map is left open for the APP to fill in
 * through declaration merging, once, against the host it ships:
 *
 * ```ts
 * declare module '@amritk/mini-native' {
 *   interface NativeEventMap {
 *     tap: MouseEvent
 *     input: InputEvent
 *   }
 * }
 * ```
 *
 * Every `onTap` in that codebase is then typed, with no cast at any call site
 * and nothing added at runtime. This is the one place the repository's
 * `type`-over-`interface` rule is broken, and it is broken deliberately:
 * declaration merging is what makes the seam work, and only an interface can be
 * merged into.
 */
export interface NativeEventMap {
  tap: unknown
  longpress: unknown
  focus: unknown
  blur: unknown
  scroll: unknown
  load: unknown
  error: unknown
  input: unknown
  change: unknown
}

/** A handler for one of the events in {@link NativeEventMap}. */
export type NativeEventHandler<Name extends keyof NativeEventMap> = (event: NativeEventMap[Name]) => void

/**
 * Handlers common to every element. Names are the native idiom rather than the
 * web one — `onTap` instead of `onClick` — because tapping is the gesture that
 * actually exists on a device. The DOM host maps them back onto mouse events.
 *
 * There is no delegation and no capture phase: native targets have no bubbling
 * to hook into, so every listener is attached directly to its element.
 */
type EventHandlers = {
  onTap?: NativeEventHandler<'tap'>
  onLongPress?: NativeEventHandler<'longpress'>
  onFocus?: NativeEventHandler<'focus'>
  onBlur?: NativeEventHandler<'blur'>
}

/**
 * What an element IS, as opposed to what it looks like.
 *
 * This is the one piece of information both targets need and neither can infer.
 * A native host turns it into an accessibility role; the DOM host turns it into
 * an actual element, so `role="button"` builds a `<button>` and inherits focus
 * order, Enter and Space activation, and form submission rather than
 * re-synthesising all three onto a `<div>`.
 *
 * The set is closed and small on purpose: every entry has a real mapping on
 * both sides, and a role neither target can honour would be a promise the
 * runtime cannot keep.
 *
 * Two of them deliberately do NOT get their obvious HTML element. `list` and
 * `listitem` build a generic element carrying the ARIA role instead of `<ul>`
 * and `<li>`, because `<ul>` accepts only `<li>` — a parse-level content model
 * — and the control-flow components put a wrapper in between:
 *
 * ```tsx
 * <view role="list">
 *   <For each={rows}>{(row) => <view role="listitem">…</view>}</For>
 * </view>
 * ```
 *
 * See the invariant on `Host.createFlowHost`.
 */
export type Role =
  | 'button'
  | 'link'
  | 'heading'
  | 'list'
  | 'listitem'
  /** The page or screen header. Spelled the ARIA way; the DOM host builds `<header>`. */
  | 'banner'
  | 'navigation'
  | 'main'
  /** The page or screen footer. Spelled the ARIA way; the DOM host builds `<footer>`. */
  | 'contentinfo'
  /** Strips the element's semantics and hides it from assistive technology. */
  | 'none'

/**
 * The roles above as a runtime set, for hosts that want to validate one.
 *
 * Every name here is an ARIA role rather than an HTML tag, which is the same
 * rule the `as` override follows: a tag is not a portable concept, and letting
 * one in through a prop meant to describe SEMANTICS is how web-only thinking
 * re-enters a component written for both targets. It is why the landmarks are
 * `banner` and `contentinfo` rather than the friendlier `header` and `footer` —
 * those two are elements, and these two are what the element MEANS.
 */
export const ROLES = [
  'button',
  'link',
  'heading',
  'list',
  'listitem',
  'banner',
  'navigation',
  'main',
  'contentinfo',
  'none',
] as const

/**
 * The accessibility surface, shared by every tag.
 *
 * It is not a web feature with a native counterpart, it is one fact per element
 * that both targets need — which is why it lives on the vocabulary rather than
 * in a host. Adding it cost the `Host` contract nothing: `role` and `level`
 * arrive through `createElement`'s existing props parameter, the rest through
 * `setProperty`.
 */
type AccessibilityProps = {
  /**
   * What this element is. STATIC, with no reactive form, because on the DOM it
   * decides which element gets built and a node cannot change what it is — the
   * same constraint `input multiline` lives under. A getter here is reported by
   * {@link warn} rather than silently read once.
   */
  role?: Role
  /**
   * Heading depth, alongside `role="heading"`. Static for the same reason
   * `role` is; the DOM host builds `<h1>`…`<h6>` from it. Defaults to 2, on the
   * grounds that a page's single `<h1>` should be deliberate.
   */
  level?: 1 | 2 | 3 | 4 | 5 | 6
  /**
   * The accessible name — what a screen reader announces. This is the ONLY
   * spelling of it: `image` has no separate `alt`, because two names for one
   * concept is exactly the drift a five-tag vocabulary exists to avoid. The DOM
   * host still emits `alt` on an `<img>`, which is where that spelling belongs.
   */
  label?: MaybeReactive<string>
  /** Supplementary description, announced after the name. */
  hint?: MaybeReactive<string>
  /**
   * Whether the element takes part in focus order. The semantic roles are
   * focusable already; this is for the elements that are interactive without
   * looking it.
   */
  focusable?: MaybeReactive<boolean>
  /** Unavailable for interaction, and announced as such rather than merely greyed. */
  disabled?: MaybeReactive<boolean>
  selected?: MaybeReactive<boolean>
  checked?: MaybeReactive<boolean>
  expanded?: MaybeReactive<boolean>
  /**
   * Where a `role="link"` points. Hosts with nothing addressable ignore it;
   * the DOM host puts it on a real `<a>`, so middle-click, open-in-new-tab, and
   * a crawler all work without the app doing anything.
   */
  href?: MaybeReactive<string>
}

/**
 * Props accepted by every element in the vocabulary.
 *
 * `children` is NOT here, even though every element has some. It belongs to the
 * individual tags because what a tag may contain differs sharply between them:
 * only `text` accepts a text run, and `image` and `input` are leaves with
 * nothing legal inside at all. See {@link ContainerChildren}.
 */
type CommonProps = {
  /**
   * Called with the element once its children are attached. This is the escape
   * hatch for anything with no prop form — wiring an extra listener, holding a
   * reference for imperative focus, calling a binding by hand.
   */
  ref?: (element: HostElement) => void
  /**
   * Reactive visibility, wired to the host's `setVisible`. A plain boolean
   * applies once, a getter tracks. This hides in place; adding and removing
   * elements structurally is what the control-flow components are for.
   */
  show?: MaybeReactive<boolean>
  /** Accepted because JSX reserves it, ignored at runtime — keying lives in `list`. */
  key?: string | number
  class?: MaybeReactive<ClassValue>
  style?: MaybeReactive<StyleValue | null>
  id?: MaybeReactive<string>
  /** A stable handle for UI tests, passed straight through to the host. */
  testId?: MaybeReactive<string>
} & EventHandlers &
  AccessibilityProps

/** Per-tag props, layered on top of {@link CommonProps}. */
type TagProps = {
  view: {
    /** Nested elements. A container cannot hold a bare text run — see {@link ContainerChildren}. */
    children?: ContainerChildren
  }
  text: {
    /**
     * The text run, and the only place in the vocabulary one is allowed. A
     * function child becomes a reactive text node; nested elements are fine too,
     * which is how a run is styled in pieces.
     */
    children?: MiniChildren
    /** Truncate after this many lines. Maps to the host's own line-clamp. */
    lines?: MaybeReactive<number>
  }
  image: {
    /** An image is a leaf: there is nothing a target could render inside one. */
    children?: never
    src?: MaybeReactive<string>
    /** How the image fills its box. The names match the CSS `object-fit` values the DOM host maps onto. */
    fit?: MaybeReactive<'cover' | 'contain' | 'fill' | 'none'>
    onLoad?: NativeEventHandler<'load'>
    onError?: NativeEventHandler<'error'>
  }
  'scroll-view': {
    /** Nested elements. Like any container, it cannot hold a bare text run. */
    children?: ContainerChildren
    /** Scroll axis. Defaults to vertical, matching every native scroll container. */
    direction?: MaybeReactive<'vertical' | 'horizontal'>
    onScroll?: NativeEventHandler<'scroll'>
  }
  input: {
    /** An input is a leaf; its content is the `value` prop, not a child. */
    children?: never
    value?: MaybeReactive<string>
    placeholder?: MaybeReactive<string>
    readonly?: MaybeReactive<boolean>
    /**
     * Grows to multiple lines. Unlike every other prop this one is STRUCTURAL
     * and static: it decides what the host builds rather than how the built
     * element behaves — the DOM host makes a `<textarea>` instead of an
     * `<input>` — and no target can turn one control into the other afterwards.
     * That is why it is a plain boolean with no reactive form: a getter would
     * typecheck and then silently only ever be read once.
     */
    multiline?: boolean
    /** Which on-screen keyboard to raise. Native targets have no text `type`, they have a keyboard mode. */
    keyboard?: MaybeReactive<'text' | 'number' | 'email' | 'phone' | 'password'>
    onInput?: NativeEventHandler<'input'>
    onChange?: NativeEventHandler<'change'>
  }
}

/** The complete prop type for one tag. */
export type ElementProps<Tag extends ElementTag> = CommonProps & TagProps[Tag]

/**
 * The loose bag the runtime iterates. Call sites are checked richly through
 * `JSX.IntrinsicElements`; by the time props reach `jsx` they are just a
 * string-keyed object, and `unknown` forces the runtime to narrow each value
 * before it uses it.
 */
export type ElementPropBag = { readonly [prop: string]: unknown }
