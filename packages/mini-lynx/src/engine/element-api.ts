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
   * Creates a `list`, which unlike every other creator takes the recycling
   * callbacks the framework is expected to implement.
   *
   * The engine owns the cell and calls back to have it filled: it asks for the
   * element at a data index through `componentAtIndex`, and hands one back
   * through `enqueueComponent` when it scrolls out of range. That is the
   * inversion which makes a list bounded — a collection of ten thousand rows
   * realises only the cells the viewport can show — and it is a different
   * contract from the rest of this runtime, where the framework owns every
   * element it creates. `recycle.ts` is the whole of this package's side of it.
   *
   * Optional because a partial engine may omit it; `createElement` falls back to
   * `__CreateElement`, which yields a `list` that lays out and scrolls but
   * realises every row up front.
   */
  __CreateList?: (
    parentComponentUniqueId: number,
    componentAtIndex: ComponentAtIndex,
    enqueueComponent: EnqueueComponent,
  ) => LynxElement

  /**
   * Replaces a list's recycling callbacks after creation.
   *
   * Needed because the element exists before the data source is attached to it —
   * JSX builds the `<list>`, and a `ref` is what hands it to `recycle`. It is
   * also how a list is torn down: ReactLynx installs an inert pair rather than
   * clearing them, because the engine may still be mid-scroll, and this package
   * does the same.
   */
  __UpdateListCallbacks?: (
    list: LynxElement,
    componentAtIndex: ComponentAtIndex,
    enqueueComponent: EnqueueComponent,
  ) => void

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
  /**
   * Reads one attribute back, without materialising the whole bag.
   *
   * Optional: it arrived in Lynx 2.14, and an engine older than that has
   * `__GetAttributes` and nothing else.
   */
  __GetAttributeByName?: (element: LynxElement, name: string) => unknown
  /** The element's tag, as the engine knows it. */
  __GetTag?: (element: LynxElement) => string
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

  // ---------------------------------------------------------------- gestures

  /**
   * Installs a gesture recogniser on an element, and states how it relates to
   * the recognisers already there.
   *
   * `relationMap` is the whole reason this exists rather than being another
   * event: `waitFor` makes this recogniser defer to another until that one
   * fails, `simultaneous` lets both win, and `continueWith` hands the stream on.
   * Ordinary `bindtap`/touch listeners cover recognising a gesture; they cannot
   * express one recogniser deferring to another, which is what an app needs the
   * moment a tap lives inside a pan lives inside a scroller.
   *
   * `type` is the engine's recogniser enum and `config.callbacks` carries
   * worklet handles, not closures — the same constraint as `__AddEvent`, for the
   * same reason. See `gestures/`.
   */
  __SetGestureDetector?: (
    element: LynxElement,
    id: number,
    type: number,
    config: GestureDetectorConfig,
    relationMap: Readonly<Record<string, readonly number[]>>,
  ) => void

  __RemoveGestureDetector?: (element: LynxElement, id: number) => void

  // ---------------------------------------------------------------- querying

  /**
   * The first descendant matching a CSS selector, or `undefined`.
   *
   * This is the engine's own selector engine — the same one the stylesheet uses,
   * which is why an element created with an out-of-range
   * `parentComponentUniqueId` is invisible to it as well as to CSS.
   */
  __QuerySelector?: (element: LynxElement, selector: string, params?: object) => LynxElement | undefined
  __QuerySelectorAll?: (element: LynxElement, selector: string, params?: object) => LynxElement[]

  /**
   * Calls a UI method on an element.
   *
   * A handful of the engine's capabilities are not attributes and cannot be:
   * `scrollTo` on a scroller, `boundingClientRect` on anything, `setFocus`,
   * `scrollIntoView`. They are imperative because they are *actions* rather than
   * state, and this is how they are reached.
   *
   * The callback receives `{ code, data }`, where a zero `code` means success —
   * an engine convention rather than a JavaScript one, so `/elements` turns it
   * into a rejected promise rather than leaving it to every call site.
   */
  __InvokeUIMethod?: (
    element: LynxElement,
    method: string,
    params: object,
    callback: (result: UIMethodResult) => void,
  ) => void

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

/**
 * A worklet handle: the only callable thing the engine accepts, whether it is
 * an event listener or a gesture callback.
 *
 * The engine never looks inside `value`. It fetches a global named `runWorklet`
 * and calls `runWorklet(value, [event])` — and `runWorklet` is supplied by the
 * FRAMEWORK, not by the engine, which is what lets this package hand out plain
 * integers and stay compilerless. See `events/worklet-registry.ts`.
 */
export type WorkletHandle = { readonly type: 'worklet'; readonly value: unknown }

/**
 * What a gesture recogniser is configured with: its named callbacks, as worklet
 * handles, plus whatever tuning the recogniser type itself takes (a minimum
 * distance for a pan, a maximum duration for a tap).
 */
export type GestureDetectorConfig = {
  readonly callbacks: readonly { readonly name: string; readonly callback: WorkletHandle }[]
  readonly config?: Readonly<Record<string, unknown>>
}

/** What `__InvokeUIMethod` hands its callback. A zero `code` means success. */
export type UIMethodResult = { readonly code: number; readonly data?: unknown }

/**
 * Asks for the element at a data index, returning its engine id.
 *
 * The engine calls this; the framework's job is to have an element ready and to
 * commit it with `__FlushElementTree(root, { triggerLayout: true, operationID,
 * elementID, listID })` before returning that id. `operationID` is the engine's
 * correlation token for this request and must be handed back untouched.
 */
export type ComponentAtIndex = (
  list: LynxElement,
  listID: number,
  cellIndex: number,
  operationID: number,
  enableReuseNotification?: boolean,
) => number

/** Hands a cell back when it scrolls out of range, by the id `componentAtIndex` returned. */
export type EnqueueComponent = (list: LynxElement, listID: number, sign: number) => void
