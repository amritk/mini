import type {
  ComponentAtIndex,
  EnqueueComponent,
  EventListenerValue,
  LynxElement,
  LynxElementApi,
} from '../engine/element-api'

/**
 * A complete in-memory implementation of Lynx's Element PAPI.
 *
 * This is the package's reference engine and what the whole suite runs against.
 * That is a stronger position than it sounds: the code under test is the code
 * that ships. There is no second renderer to keep in step, no DOM-shaped
 * approximation that quietly disagrees with the device, and no class of defect
 * that can hide in the gap between them — because there is no gap. The engine's
 * API is small enough to implement honestly, which is precisely why the runtime
 * takes it as an argument.
 *
 * It is a fake rather than a simulator. It maintains the tree faithfully and
 * records what it was asked to do; it lays nothing out, so it can tell you that
 * an element was given `flex-direction: row` and never that it ended up 200
 * pixels wide. Layout belongs to the engine and is not something a test in this
 * package should be asserting anyway.
 *
 * Exported from `@amritk/mini-lynx/testing` so an APP can use it too — for a
 * component test that asserts on the tree its component builds, with no device,
 * no emulator and no browser in the loop.
 */
export type FakeElement = {
  /** A stable handle, so a call log and a serialised tree can name an element. */
  readonly id: number
  readonly tag: string
  attrs: Record<string, unknown>
  styles: Record<string, string>
  classes: string
  elementId: string | null
  /**
   * One listener per `type:name`, matching the engine's real constraint.
   *
   * Reproduced rather than smoothed over: working around it is the runtime's
   * job, in `add-event.ts`, and a fake that quietly allowed many listeners
   * would make the bug it exists to prevent untestable.
   */
  events: Map<string, EventListenerValue>
  /**
   * Installed gesture recognisers, by id.
   *
   * Many per element, unlike `events` — the engine's constraint there is one
   * listener per `(type, name)`, and a gesture's whole purpose is that several
   * coexist and arbitrate between themselves.
   */
  gestures: Map<number, { type: number; config: unknown; relationMap: Readonly<Record<string, readonly number[]>> }>
  children: FakeElement[]
  parent: FakeElement | null
}

export type FakeEngine = {
  /** The PAPI to hand to `setEngine`. */
  readonly api: LynxElementApi
  /** The page element, as the engine would already own it. */
  readonly page: FakeElement
  /** The same node, typed the way the PAPI hands elements out — no cast at the call site. */
  readonly pageElement: LynxElement
  /** How many times the tree has been committed, for asserting flush coalescing. */
  flushes: () => number
  /** Every PAPI call since the last clear, oldest first. */
  calls: () => readonly string[]
  clearCalls: () => void
  /**
   * Fires an event at an element the way the engine would.
   *
   * The payload is the ENGINE's shape — a gesture under `detail`, a scroll as
   * `scrollLeft`/`scrollTop` — because that is what a handler will actually
   * receive on a device. Nothing in this package normalises it, so a test that
   * asserts on `event.detail.x` is asserting on the real thing.
   */
  dispatch: (element: FakeElement, name: string, event?: unknown, type?: string) => void
  /**
   * Fires one of a gesture recogniser's callbacks, the way the engine would.
   *
   * Goes through the same `runWorklet` indirection `dispatch` uses, so the
   * worklet registry stays on the tested path rather than beside it — a gesture
   * callback is dispatched by exactly the mechanism an event listener is, and
   * gets the same silent failure if it is ever handed a raw closure.
   */
  dispatchGesture: (element: FakeElement, id: number, callbackName: string, event?: unknown) => void
  /**
   * Scrolls a row of a recycling `<list>` into range, the way the engine would.
   *
   * The engine drives cell reuse by CALLING the framework, so a recycler cannot
   * be tested by inspecting a tree — nothing happens until something asks. These
   * two methods are that something, and they are deliberately the same pair
   * Lynx's own `@lynx-js/react/testing-library` exposes (`enterListItemAtIndex`
   * / `leaveListItem`), so a test here drives the recycler through the same
   * sequence a device does.
   *
   * Returns the cell's engine id — what `componentAtIndex` answered — which is
   * also the handle {@link FakeEngine.leaveListItem} takes.
   */
  enterListItemAtIndex: (list: FakeElement, index: number) => number
  /** Scrolls a cell out of range, returning it to the framework's pool. */
  leaveListItem: (list: FakeElement, sign: number) => void
  /** Finds the first element with this tag, depth-first. Convenience for tests. */
  find: (tag: string) => FakeElement | undefined
  /** Finds every element with this tag, depth-first. */
  findAll: (tag: string) => readonly FakeElement[]
  /** Finds the element carrying this `data-testid`, the way a UI test would. */
  findByTestId: (testId: string) => FakeElement | undefined
  /**
   * Events dispatched to a STRING handler, which a device would have sent
   * across to the background thread.
   *
   * This runtime does not register string handlers, so an entry here means
   * something else did — which is worth being able to assert on rather than
   * silently dropping.
   */
  publishedEvents: () => readonly { handler: string; event: unknown }[]
  /**
   * Stubs a UI method, so `invoke(element, name)` resolves with something.
   *
   * This fake lays nothing out, so it cannot answer `boundingClientRect` or
   * `getScrollInfo` on its own, and an un-stubbed method reports the engine's
   * "not implemented" failure rather than a plausible zero. Registering a
   * responder puts the expected value in the test that depends on it.
   *
   * @example
   * ```ts
   * engine.onInvoke('boundingClientRect', () => ({ code: 0, data: { width: 320, height: 48 } }))
   * ```
   */
  onInvoke: (
    method: string,
    respond: (element: FakeElement, params: object) => { code: number; data?: unknown },
  ) => void
}

/** Creates one fake engine. Each call is an independent tree with its own log. */
export const createFakeEngine = (): FakeEngine => {
  let flushes = 0
  let nextId = 0
  let calls: string[] = []

  const record = (line: string): void => {
    calls.push(line)
    // A log nobody trims grows for as long as the engine is alive, and it is
    // always the most recent calls that a test or a screen cares about.
    //
    // Trimmed in batches rather than on every call, and that is a real cost
    // rather than tidiness. Trimming the moment the log passes the limit means
    // copying `KEPT_CALLS` entries per engine call FOREVER after the first
    // thousand — so a suite that builds a thousand rows pays twenty-five million
    // array writes for a log it keeps a thousand lines of, and the fake, not the
    // runtime, becomes what its own benchmark measures. Letting it run to a high
    // water mark first amortises the copy to nothing per call. `calls()` slices
    // to the limit on the way out, so nobody can observe the slack.
    if (calls.length >= TRIM_CALLS_AT) calls = calls.slice(-KEPT_CALLS)
  }

  const element = (tag: string): FakeElement => ({
    id: nextId++,
    tag,
    attrs: {},
    styles: {},
    classes: '',
    elementId: null,
    events: new Map(),
    gestures: new Map(),
    children: [],
    parent: null,
  })

  const page = element('page')
  const published: { handler: string; event: unknown }[] = []

  /** Stubbed UI-method responders, by method name. See `onInvoke`. */
  const uiMethods = new Map<string, (element: FakeElement, params: object) => { code: number; data?: unknown }>()

  /** The recycling callbacks each `list` was created with. See `enterListItemAtIndex`. */
  const recyclers = new Map<FakeElement, { componentAtIndex: ComponentAtIndex; enqueueComponent: EnqueueComponent }>()

  /** Correlation tokens, the way the engine hands out a fresh one per request. */
  let nextOperationId = 1

  const detach = (node: FakeElement): void => {
    const parent = node.parent
    if (!parent) return
    const at = parent.children.indexOf(node)
    if (at !== -1) parent.children.splice(at, 1)
    node.parent = null
  }

  const api: LynxElementApi = {
    __CreateElement: (tag, parentComponentUniqueId) => {
      const created = element(tag)
      record(`__CreateElement("${tag}", ${parentComponentUniqueId}) → #${created.id}`)
      return toLynx(created)
    },

    __CreateRawText: (text) => {
      const created = element('raw-text')
      created.attrs['text'] = text
      record(`__CreateRawText(${format(text)}) → #${created.id}`)
      return toLynx(created)
    },

    __CreateWrapperElement: (parentComponentUniqueId) => {
      const created = element('wrapper')
      // The id is logged rather than hardcoded, so the log can distinguish a
      // correct call from one passing the out-of-range `0` that `componentId()`
      // exists to prevent. A fake that always printed `0` would make that bug
      // invisible in exactly the place set up to catch it.
      record(`__CreateWrapperElement(${parentComponentUniqueId}) → #${created.id}`)
      return toLynx(created)
    },

    __AppendElement: (parent, child) => {
      const target = fromLynx(parent)
      const node = fromLynx(child)
      record(`__AppendElement(#${target.id}, #${node.id})`)
      detach(node)
      target.children.push(node)
      node.parent = target
    },

    __InsertElementBefore: (parent, child, anchor) => {
      const target = fromLynx(parent)
      const node = fromLynx(child)
      const before = anchor === undefined ? undefined : fromLynx(anchor)
      record(`__InsertElementBefore(#${target.id}, #${node.id}, ${before ? `#${before.id}` : 'undefined'})`)
      detach(node)
      const at = before === undefined ? -1 : target.children.indexOf(before)
      target.children.splice(at === -1 ? target.children.length : at, 0, node)
      node.parent = target
    },

    __RemoveElement: (parent, child) => {
      const target = fromLynx(parent)
      const node = fromLynx(child)
      record(`__RemoveElement(#${target.id}, #${node.id})`)
      if (node.parent === target) detach(node)
    },

    __GetParent: (el) => {
      const parent = fromLynx(el).parent
      return parent === null ? null : toLynx(parent)
    },

    __GetChildren: (el) => fromLynx(el).children.map(toLynx),

    __GetPageElement: () => toLynx(page),

    // Ids start above zero for the same reason the engine's do: zero is out of
    // range there, and a fake that handed it out would let a bug through that
    // silently costs an app its stylesheet on a device.
    __GetElementUniqueID: (el) => fromLynx(el).id + FIRST_ELEMENT_ID,

    __FirstElement: (el) => {
      const first = fromLynx(el).children[0]
      return first === undefined ? null : toLynx(first)
    },

    __NextElement: (el) => {
      const node = fromLynx(el)
      const siblings = node.parent?.children
      if (!siblings) return null
      const next = siblings[siblings.indexOf(node) + 1]
      return next === undefined ? null : toLynx(next)
    },

    __SetAttribute: (el, name, value) => {
      const target = fromLynx(el)
      record(`__SetAttribute(#${target.id}, "${name}", ${format(value)})`)
      if (value === null) delete target.attrs[name]
      else target.attrs[name] = value
    },

    __GetAttributes: (el) => fromLynx(el).attrs,

    __GetAttributeByName: (el, name) => fromLynx(el).attrs[name],

    __GetTag: (el) => fromLynx(el).tag,

    __SetID: (el, id) => {
      const target = fromLynx(el)
      record(`__SetID(#${target.id}, ${format(id)})`)
      target.elementId = id ?? null
    },

    __SetClasses: (el, classes) => {
      const target = fromLynx(el)
      record(`__SetClasses(#${target.id}, "${classes}")`)
      target.classes = classes
    },

    __SetInlineStyles: (el, styles) => {
      const target = fromLynx(el)
      record(`__SetInlineStyles(#${target.id}, ${format(styles)})`)
      // The string form replaces the bag too, and parsing CSS text is not this
      // fake's job — a test that needs to assert on declarations passes the map.
      target.styles = typeof styles === 'string' ? {} : { ...styles }
    },

    __AddInlineStyle: (el, name, value) => {
      const target = fromLynx(el)
      record(`__AddInlineStyle(#${target.id}, "${name}", ${format(value)})`)
      if (value === null || value === undefined) delete target.styles[name]
      else target.styles[name] = String(value)
    },

    __AddEvent: (el, type, name, listener) => {
      const target = fromLynx(el)
      // The engine accepts a string or a worklet handle and NOTHING else. A raw
      // function is stored by a device engine and then never invoked, so this
      // throws where the device stays quiet: the whole point of testing against
      // a faithful fake is that this mistake fails here rather than on a phone.
      if (typeof listener === 'function') {
        throw new TypeError('__AddEvent listener must be a string or a worklet handle, not a function.')
      }
      record(
        `__AddEvent(#${target.id}, "${type}", "${name}", ${listener === null ? 'null' : typeof listener === 'string' ? `"${listener}"` : 'worklet'})`,
      )
      if (listener === null) target.events.delete(`${type}:${name}`)
      else target.events.set(`${type}:${name}`, listener)
    },

    __CreateList: (parentComponentUniqueId, componentAtIndex, enqueueComponent) => {
      const created = element('list')
      record(`__CreateList(${parentComponentUniqueId}) → #${created.id}`)
      recyclers.set(created, { componentAtIndex, enqueueComponent })
      return toLynx(created)
    },

    __UpdateListCallbacks: (list, componentAtIndex, enqueueComponent) => {
      const target = fromLynx(list)
      record(`__UpdateListCallbacks(#${target.id})`)
      recyclers.set(target, { componentAtIndex, enqueueComponent })
    },

    __SetGestureDetector: (el, id, type, config, relationMap) => {
      const target = fromLynx(el)
      record(`__SetGestureDetector(#${target.id}, ${id}, ${type})`)
      target.gestures.set(id, { type, config, relationMap })
    },

    __RemoveGestureDetector: (el, id) => {
      const target = fromLynx(el)
      record(`__RemoveGestureDetector(#${target.id}, ${id})`)
      target.gestures.delete(id)
    },

    __QuerySelector: (el, selector) => {
      const found = matchAll(fromLynx(el), selector)[0]
      return found === undefined ? undefined : toLynx(found)
    },

    __QuerySelectorAll: (el, selector) => matchAll(fromLynx(el), selector).map(toLynx),

    __InvokeUIMethod: (el, method, params, callback) => {
      const target = fromLynx(el)
      record(`__InvokeUIMethod(#${target.id}, "${method}", ${format(params)})`)
      const handler = uiMethods.get(method)
      // No handler is a FAILURE rather than a silent success, because that is
      // what an engine reports for a method the element does not implement —
      // and because this fake lays nothing out, so it cannot honestly answer
      // `boundingClientRect` on its own. A test that needs a result stubs one
      // with `onInvoke`, which makes the expected value visible in the test
      // rather than invented here.
      callback(handler ? handler(target, params) : { code: -1, data: `no handler for "${method}"` })
    },

    __FlushElementTree: (el, options) => {
      flushes++
      // The arguments are logged, not just the call. A list cell is committed
      // with `{ operationID, elementID, listID }` and the engine matches its
      // request against them — a commit missing them lays the cell out at zero
      // height on a device while looking perfectly correct in a tree assertion.
      if (el === undefined && options === undefined) record('__FlushElementTree()')
      else record(`__FlushElementTree(#${fromLynx(el as LynxElement).id}, ${format(options ?? null)})`)
    },
  }

  const walk = (node: FakeElement, visit: (node: FakeElement) => void): void => {
    visit(node)
    for (const child of node.children) walk(child, visit)
  }

  const collect = (predicate: (node: FakeElement) => boolean): FakeElement[] => {
    const found: FakeElement[] = []
    walk(page, (node) => {
      if (predicate(node)) found.push(node)
    })
    return found
  }

  return {
    api,
    page,
    pageElement: toLynx(page),
    flushes: () => flushes,
    // Sliced here rather than trimmed eagerly, so the slack `record` leaves
    // between trims stays an implementation detail — a caller sees the last
    // `KEPT_CALLS` calls and never the batch that has not been dropped yet.
    calls: () => (calls.length > KEPT_CALLS ? calls.slice(-KEPT_CALLS) : calls),
    clearCalls: () => {
      calls = []
    },
    dispatch: (target, name, event = {}, type = 'bindEvent') => {
      const listener = target.events.get(`${type}:${name}`)
      if (listener === null || listener === undefined) return
      // Dispatch the way the engine does: a worklet handle is passed back to
      // the global `runWorklet` the framework installed, with the event in an
      // array. Reproducing that indirection rather than reaching for the
      // closure directly is what makes the registry a tested path.
      if (typeof listener === 'string') {
        published.push({ handler: listener, event })
        return
      }
      const runWorklet = (globalThis as { runWorklet?: (value: unknown, args: unknown[]) => void }).runWorklet
      runWorklet?.(listener.value, [event])
    },
    enterListItemAtIndex: (list, index) => {
      const recycler = recyclers.get(list)
      if (!recycler) throw new Error('That element was not created as a recycling list.')
      return recycler.componentAtIndex(toLynx(list), list.id + FIRST_ELEMENT_ID, index, nextOperationId++, false)
    },

    leaveListItem: (list, sign) => {
      const recycler = recyclers.get(list)
      if (!recycler) throw new Error('That element was not created as a recycling list.')
      recycler.enqueueComponent(toLynx(list), list.id + FIRST_ELEMENT_ID, sign)
    },

    dispatchGesture: (target, id, callbackName, event = {}) => {
      const detector = target.gestures.get(id)
      if (!detector) return
      const config = detector.config as { callbacks?: { name: string; callback: { value: unknown } }[] }
      const entry = config.callbacks?.find((candidate) => candidate.name === callbackName)
      if (!entry) return
      const runWorklet = (globalThis as { runWorklet?: (value: unknown, args: unknown[]) => void }).runWorklet
      runWorklet?.(entry.callback.value, [event])
    },
    find: (tag) => collect((node) => node.tag === tag)[0],
    findAll: (tag) => collect((node) => node.tag === tag),
    findByTestId: (testId) => collect((node) => node.attrs['data-testid'] === testId)[0],
    publishedEvents: () => published,
    onInvoke: (method, respond) => {
      uiMethods.set(method, respond)
    },
  }
}

/**
 * Matches a CSS selector against a subtree, over the subset this fake claims.
 *
 * **Supported:** a tag (`view`), an id (`#feed`), a class (`.row`), any compound
 * of those (`view.row.selected`), a comma-separated list, and the descendant
 * combinator (`view .row`). That covers what selector-based code in an app
 * actually reaches for.
 *
 * **Everything else throws**, and that is the design rather than a shortcut. The
 * engine's selector support is wider than this, so the honest failure for a
 * child combinator or an attribute selector is "this fake does not implement
 * that" — said out loud. Returning an empty match instead would be
 * indistinguishable from "nothing matched", which is exactly how a test comes to
 * assert the opposite of what a device does.
 */
const matchAll = (root: FakeElement, selector: string): FakeElement[] => {
  const groups = selector
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (groups.length === 0) throw new SyntaxError(`Empty selector: ${format(selector)}`)

  const found: FakeElement[] = []
  for (const group of groups) {
    // Every step but the last narrows the candidate set to descendants; the last
    // one selects. `view .row` therefore means "a .row anywhere under a view".
    let scopes = [root]
    for (const step of group.split(/\s+/).map(compileCompound)) {
      const matched: FakeElement[] = []
      for (const scope of scopes) {
        descendants(scope, (node) => {
          if (step(node) && !matched.includes(node)) matched.push(node)
        })
      }
      scopes = matched
    }
    for (const node of scopes) if (!found.includes(node)) found.push(node)
  }
  // Tree order, so the first result of a `querySelector` is the first in the
  // document the way it is on the engine, not the first group's first match.
  const order: FakeElement[] = []
  descendants(root, (node) => {
    if (found.includes(node)) order.push(node)
    return false
  })
  return order
}

/** Compiles one compound selector (`view.row#a`) into a predicate. */
const compileCompound = (compound: string): ((node: FakeElement) => boolean) => {
  const tokens = compound.match(/^[a-zA-Z][\w-]*|[.#][\w-]+/g)
  if (!tokens || tokens.join('') !== compound) {
    throw new SyntaxError(
      `createFakeEngine implements tag, #id, .class, compounds of those, and the descendant combinator — not ${format(compound)}.`,
    )
  }
  return (node) =>
    tokens.every((token) =>
      token.startsWith('#')
        ? node.elementId === token.slice(1)
        : token.startsWith('.')
          ? node.classes.split(/\s+/).includes(token.slice(1))
          : node.tag === token,
    )
}

/** Visits every descendant of `node`, excluding `node` itself. */
const descendants = (node: FakeElement, visit: (node: FakeElement) => unknown): void => {
  for (const child of node.children) {
    visit(child)
    descendants(child, visit)
  }
}

/**
 * Where this fake starts numbering elements.
 *
 * Engine ids start well above zero, and code that treats zero as "no component"
 * is the bug `componentId()` exists to prevent — so the fake starts high enough
 * that such code fails here too.
 */
const FIRST_ELEMENT_ID = 10

/**
 * How many of the most recent PAPI calls {@link FakeEngine.calls} reports.
 *
 * A window rather than the whole history because a test asserts on what just
 * happened, and an engine driving a long-lived screen would otherwise hold every
 * string it ever formatted.
 */
const KEPT_CALLS = 1000

/**
 * Where the log is actually trimmed back to {@link KEPT_CALLS}.
 *
 * The gap between the two is what makes the trim amortised — see `record`. It
 * costs at most this many strings of slack, which is a trade a test double can
 * afford and a per-call array copy is not.
 */
const TRIM_CALLS_AT = KEPT_CALLS * 4

/** Renders a value the way a call log should show it — short, and obviously a value. */
const format = (value: unknown): string => {
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

/*
 * The engine's element type is opaque to everyone, including this fake. Casting
 * at the two crossings keeps the rest of the file typed against the real node
 * shape, which is the same arrangement a device engine has on the other side.
 */
const toLynx = (node: FakeElement): LynxElement => node as unknown as LynxElement
const fromLynx = (node: LynxElement): FakeElement => node as unknown as FakeElement
