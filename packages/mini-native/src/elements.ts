import type { InputEvent, NativeEvent, PointerEvent, ScrollEvent, TapEvent } from './events'
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
 * The entries below are the ones this vocabulary NAMES, so the framework owns
 * their shape and every host normalises to it. That is what makes the ordinary
 * case writable once:
 *
 * ```tsx
 * <scroll-view onScroll={(event) => headerOpacity(event.y)} />
 * ```
 *
 * These were all `unknown` at first, on the reasoning that the package cannot
 * know what an event is — a Lynx gesture and a DOM `MouseEvent` have nothing in
 * common — leaving apps to fill them in through declaration merging. That is
 * right for an arbitrary event and wrong for these, because merging picks ONE
 * shape: an app shipping both a web and a device build would have to declare a
 * `MouseEvent` that is a lie on the device, or the reverse. There is no
 * declaration that is true on both, which is write-once failing at the event
 * boundary no matter how good the rest of the layer is.
 *
 * The seam stays open for what the framework does NOT name. This is an
 * interface rather than a type alias so an app can merge in the events its own
 * host emits, once, against the host it ships:
 *
 * ```ts
 * declare module '@amritk/mini-native' {
 *   interface NativeEventMap {
 *     swipe: { direction: 'left' | 'right' }
 *   }
 * }
 * ```
 *
 * Merging can ADD entries but not redefine the ones below, which is the
 * intended asymmetry: the payloads the framework guarantees are not negotiable
 * per app, or they would stop being guarantees. Reaching past a normalised shape
 * is what {@link NativeEvent.raw} is for. This is the one place the
 * repository's `type`-over-`interface` rule is broken, and it is broken
 * deliberately — only an interface can be merged into.
 */
export interface NativeEventMap {
  tap: TapEvent
  longpress: TapEvent
  focus: NativeEvent
  blur: NativeEvent
  scroll: ScrollEvent
  load: NativeEvent
  error: NativeEvent
  input: InputEvent
  change: InputEvent
  submit: InputEvent
  pointer: PointerEvent
  hoverin: NativeEvent
  hoverout: NativeEvent
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
  /**
   * Every phase of every pointer over this element — down, move, up, cancel.
   *
   * The raw material rather than a gesture. One handler covers all four phases
   * because a gesture is a sequence and splitting it across four props would
   * mean reassembling it at every call site. Reach for the recognisers in
   * `@amritk/mini-native/gestures` before reaching for this: `pan` and `swipe`
   * are pure arithmetic over exactly this stream, which is why they are
   * portable by construction.
   */
  onPointer?: NativeEventHandler<'pointer'>
  /**
   * A pointer that can hover entered or left this element.
   *
   * These never fire on a touch-only target, and the API is shaped to make that
   * obvious rather than to smooth it over. A hover-only affordance is a design
   * bug — content nobody on a phone will ever see — not a platform difference
   * to be papered over, so nothing here synthesises a fake hover from a touch.
   */
  onHoverIn?: NativeEventHandler<'hoverin'>
  onHoverOut?: NativeEventHandler<'hoverout'>
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
  /**
   * Take focus as soon as this element is built.
   *
   * A plain boolean with no reactive form, because focusing is an EVENT rather
   * than a state: once the user taps elsewhere, a getter that still returns
   * `true` would describe something that is not true, and there is no honest
   * way to reconcile that. Use {@link focus} for anything after the first
   * moment.
   *
   * The focus is applied once the tree has been committed rather than during
   * construction, which is not a detail: an element that is not yet in the tree
   * cannot take focus on any target, so doing it eagerly would silently do
   * nothing.
   */
  autoFocus?: boolean
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
    /**
     * Whether the user can select and copy this text.
     *
     * Worth stating rather than inheriting, because the targets disagree on the
     * default — web text is selectable, native text is not — so a component that
     * says nothing behaves differently on each, and neither default is wrong
     * enough to simply pick.
     */
    selectable?: MaybeReactive<boolean>
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
    /**
     * Which way this scrolls. Defaults to vertical, matching every native
     * scroll container.
     *
     * Named `axis` rather than `direction` because CSS has already claimed the
     * second word for text direction — RTL — which is a real cross-platform
     * concern that will want a prop of its own on every element. Two meanings
     * for one prop name is the sort of thing that is free to fix now and
     * expensive later.
     */
    axis?: MaybeReactive<'vertical' | 'horizontal'>
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
    /**
     * Which on-screen keyboard to raise. Native targets have no text `type`,
     * they have a keyboard mode.
     *
     * `password` is deliberately NOT one of these — see {@link secure}.
     */
    keyboard?: MaybeReactive<'text' | 'number' | 'email' | 'phone'>
    /**
     * Masks what the user types.
     *
     * Separate from {@link keyboard} because natively they are genuinely two
     * settings, and a PIN entry needs both at once: a NUMERIC keyboard with
     * masked text. The web collapses them into `type="password"`, which is
     * exactly why the conflation was invisible until this ran on a device.
     */
    secure?: MaybeReactive<boolean>
    /**
     * What the keyboard's confirm key should say.
     *
     * The web gives you Enter-to-submit inside a `<form>` for free and a device
     * does not — it has a return key with a configurable label and a callback.
     * The portable pair is this and {@link onSubmit}, and it needs no `form`
     * element in the vocabulary: `enterkeyhint` is a real HTML attribute, so
     * the browser raises the same soft keyboard affordance a device does.
     */
    submitLabel?: MaybeReactive<'done' | 'go' | 'next' | 'search' | 'send'>
    /**
     * What this field is for, so the platform can fill it in.
     *
     * Painful to retrofit, free to design in, and the one input feature users
     * notice immediately. The set is the subset that maps onto web
     * `autocomplete` tokens, iOS `textContentType`, and Android autofill hints
     * at once — anything only one platform understands would be a promise the
     * others cannot keep.
     *
     * `phone` rather than the web's `tel`, to match {@link keyboard}. Two
     * spellings of one concept is exactly the drift a small vocabulary exists
     * to avoid, and translating it is the DOM host's job — the same job it does
     * turning `keyboard="phone"` into `type="tel"`.
     */
    autoComplete?: MaybeReactive<
      'off' | 'username' | 'password' | 'new-password' | 'email' | 'phone' | 'name' | 'one-time-code'
    >
    onInput?: NativeEventHandler<'input'>
    onChange?: NativeEventHandler<'change'>
    /**
     * The user confirmed the field — Enter on the web, the return key on a
     * device. Carries the value, so the common case needs nothing else.
     *
     * Does not fire on a {@link multiline} field, where the confirm key inserts
     * a newline instead on every target, and does not fire while an input
     * method is composing — pressing Enter to choose a candidate is not a
     * submission, and treating it as one is the classic bug in this feature.
     */
    onSubmit?: NativeEventHandler<'submit'>
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
