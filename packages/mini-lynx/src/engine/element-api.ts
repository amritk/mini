/**
 * Lynx's Element PAPI — the API surface this runtime is written against.
 *
 * This is the whole platform boundary. Everything else in the package is
 * ordinary TypeScript over signals; the engine is the only thing underneath.
 *
 * ## Why it is a type rather than an import
 *
 * Lynx injects these as bare globals into the main-thread JavaScript context,
 * so there is nothing to import. Declaring them as an explicit type — and
 * taking the object as an argument rather than reaching for `globalThis` — is
 * what makes the runtime testable off-device: a fake engine is an object
 * literal, and `@amritk/mini-lynx/testing` ships one. Every test in this
 * package runs against it, which means the code under test is the same code
 * that ships rather than a DOM-shaped approximation of it.
 *
 * ## What is deliberately absent
 *
 * This is the subset a framework with no virtual tree needs, plus the parts of
 * the engine this package chooses to expose. Lynx's full PAPI also carries
 * component lifecycle, datasets, template parts, stylesheet adoption and
 * lazy-bundle queries; none of them has a caller here, and an unused function
 * on this type would be a porting cost paid for nothing — the length of this
 * type is the size of the boundary.
 *
 * Names and signatures follow `@lynx-js/react`'s own ambient declarations,
 * which are the de-facto specification: the documentation covers a subset and
 * occasionally lags. Where the two disagree the looser of the two is used, so a
 * real engine satisfies this type either way.
 */
export type LynxElementApi = {
  // ---------------------------------------------------------------- creation

  /**
   * Creates an element of the given tag.
   *
   * Use this only for tags with no dedicated creator. The second parameter is
   * the unique id of the element that owns this one, which the runtime resolves
   * to the page — see `componentId()` in `tree.ts` for why `0` is not the
   * harmless default it appears to be. The third is an untyped info bag the
   * engine accepts and this runtime never fills in.
   */
  __CreateElement: (tag: string, parentComponentUniqueId: number, info?: object) => LynxElement

  /**
   * Per-tag creators, which are REQUIRED for the tags that have one rather than
   * being a fast path.
   *
   * The documentation says a built-in tag "cannot use `__CreateElement` and must
   * use its respective Create API", and that turns out to be literally true:
   * `__CreateElement` builds a plain fiber node for any tag but `ecom-image`, so
   * a `view` made that way is not a view. It loses `is_view()` and with it the
   * layout-only optimisation, a `text` loses text measurement, an `image` loses
   * `src` handling, and a `list` loses virtualisation. Nothing errors — the
   * element simply does less, which is the worst way for this to fail.
   *
   * (The engine's own web port and several of its tests do call
   * `__CreateElement('view', …)` and assert it works. That is the WEB
   * reimplementation, where every tag is a custom element and the distinction
   * does not exist. It is a good reminder that the web target cannot be used to
   * validate assumptions about the native one.)
   *
   * They are optional on this type only so a fake engine may omit them;
   * `createElement` prefers them whenever they are present and falls back to
   * `__CreateElement`, which is correct for every tag that has no dedicated
   * creator — `input`, `textarea`, `svg`, `webview` and the rest.
   */
  __CreateView?: (parentComponentUniqueId: number) => LynxElement
  __CreateText?: (parentComponentUniqueId: number) => LynxElement
  __CreateImage?: (parentComponentUniqueId: number) => LynxElement
  __CreateScrollView?: (parentComponentUniqueId: number) => LynxElement
  __CreateFrame?: (parentComponentUniqueId: number) => LynxElement
  /**
   * Declared for completeness and **not currently called** — see the note on
   * `CREATORS` in `tree.ts`. Unlike the others it takes the recycling callbacks
   * the framework must implement, so it cannot be used until they exist.
   */
  __CreateList?: (parentComponentUniqueId: number, ...callbacks: unknown[]) => LynxElement

  /**
   * The element's engine-assigned id, and the value every creator wants as its
   * `parentComponentUniqueId`.
   *
   * Optional because a fake engine has no real ids to hand out. See
   * `componentId()` for why passing `0` instead is not the harmless default it
   * looks like.
   */
  __GetElementUniqueID?: (element: LynxElement) => number

  /**
   * Creates a text run.
   *
   * A string in Lynx is not a node property, it is a `raw-text` ELEMENT that
   * lives inside a `<text>`. That is why `createText` exists on this boundary at
   * all, and why a bare string is illegal inside a `<view>` — see
   * `ContainerChildren`.
   */
  __CreateRawText: (text: string) => LynxElement

  /**
   * Creates a wrapper: an element that holds children without taking part in
   * layout or in the accessibility tree.
   *
   * This is exactly what control flow needs. `Show`, `Switch` and `For` each own
   * a slot in the tree, and on a target with no such concept that slot has to be
   * a real container view — which then sits between a `role="list"` and its
   * items and quietly breaks the relationship. Lynx having a first-class wrapper
   * removes the problem rather than working around it.
   */
  __CreateWrapperElement: (parentComponentUniqueId: number) => LynxElement

  // ------------------------------------------------------------------ layout

  /** Appends a child, which is also how a detached node is re-attached. */
  __AppendElement: (parent: LynxElement, child: LynxElement) => void
  /** Inserts before an anchor. Omitting the anchor appends. */
  __InsertElementBefore: (parent: LynxElement, child: LynxElement, anchor?: LynxElement) => void
  __RemoveElement: (parent: LynxElement, child: LynxElement) => void
  __GetParent: (element: LynxElement) => LynxElement | null
  /**
   * The root the engine already owns — the usual mount target.
   *
   * Optional because an app is free to mount into an element it got some other
   * way, and a fake engine in a test always is; `pageElement()` is what turns
   * its absence into a readable error rather than an undefined crossing the
   * boundary.
   */
  __GetPageElement?: () => LynxElement | undefined
  __GetChildren: (element: LynxElement) => LynxElement[]
  __FirstElement: (element: LynxElement) => LynxElement | null
  __NextElement: (element: LynxElement) => LynxElement | null

  // -------------------------------------------------------------- properties

  /** Sets an attribute. `null` removes it. */
  __SetAttribute: (element: LynxElement, name: string, value: unknown) => void
  __GetAttributes: (element: LynxElement) => Record<string, unknown>
  /** Sets the `id`, which is what an id selector and `SelectorQuery` match on. */
  __SetID: (element: LynxElement, id: string | null | undefined) => void
  /** Replaces the whole class list with a space-separated string. */
  __SetClasses: (element: LynxElement, classes: string) => void

  /**
   * Replaces every inline style, either as a map of declarations or as CSS text.
   *
   * Both forms are DECLARATIONS the engine parses as CSS, so property names are
   * the CSS spelling (`font-size`, not `fontSize`) and values carry their units
   * (`'10px'`, not `10`). `to-style-text.ts` and `to-css-name.ts` are what make
   * a style bag written either way arrive correctly here.
   */
  __SetInlineStyles: (element: LynxElement, styles: Record<string, string> | string) => void

  /** Adds or replaces one declaration, leaving the rest of the inline style alone. */
  __AddInlineStyle: (element: LynxElement, name: string, value: unknown) => void

  // ------------------------------------------------------------------ events

  /**
   * Registers a listener.
   *
   * `type` selects the propagation behaviour — `bindEvent`, `catchEvent`,
   * `capture-bind`, `capture-catch` — and `name` is the event without its
   * prefix (`tap`, not `bindtap`).
   *
   * The listener is one of exactly two things, and a raw closure is NOT one of
   * them however much the published signature suggests otherwise:
   *
   * - a **string**, naming a handler the engine routes to the background thread
   * - a **worklet handle** — `{ type: 'worklet', value }` — which the engine
   *   hands back to a global `runWorklet` on the main thread
   *
   * This runtime uses the second, with a token of its own making. A function
   * passed here is accepted, stored, and then never invoked on the fiber
   * architecture every modern app runs on, which is why the type does not admit
   * one: the mistake should not compile. See `events/worklet-registry.ts`.
   *
   * Passing `null` removes the listener. The engine keeps only ONE listener per
   * (type, name) pair and overwrites silently, which is why `add-event.ts`
   * registers a single dispatcher per pair and fans out to its own handler set.
   */
  __AddEvent: (element: LynxElement, type: string, name: string, listener: EventListenerValue) => void

  // ------------------------------------------------------------------ commit

  /**
   * Commits pending mutations. Nothing reaches the screen until this runs.
   *
   * The runtime schedules exactly one of these per tick, so a hundred signal
   * writes cost one commit — which is the difference between a cheap update and
   * a whole-tree commit per write.
   */
  __FlushElementTree: (element?: LynxElement, options?: object) => void
}

/**
 * An opaque handle to an element the engine owns.
 *
 * The runtime never inspects one; it only ever hands it back to the engine that
 * made it. A branded empty type rather than `unknown` so the two directions
 * cannot be mixed up by accident.
 */
declare const lynxElementBrand: unique symbol
export type LynxElement = { readonly [lynxElementBrand]: true }

/**
 * What `__AddEvent` accepts. A raw function is deliberately absent — see the
 * note on `__AddEvent`.
 */
export type EventListenerValue = string | { readonly type: 'worklet'; readonly value: unknown } | null
