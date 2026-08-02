import type { LynxElement, LynxElementApi } from '@amritk/mini-lynx/engine'

import { applyPreviewAttribute, reassertPreviewStyles } from './apply-preview-attribute'
import { installLynxReset, LYNX_ROOT_ATTRIBUTE } from './install-lynx-reset'
import { elementUniqueId, LYNX_EVENTS, toLynxEvent } from './to-lynx-event'

/**
 * Lynx's Element PAPI, implemented over the DOM.
 *
 * The playground is a native app. It has no device in the loop and it deploys
 * as a static page, so something has to stand in for the engine — and the
 * interesting question is at which level. The old answer was a DOM *host*: a
 * second renderer behind an abstraction both targets implemented, which meant
 * every feature was written twice and the two could disagree. That abstraction
 * is gone.
 *
 * The answer one level down is this file. Lynx's whole platform boundary is
 * about thirty functions, so a browser can simply BE the engine — which is not
 * a workaround but the sanctioned shape of a web target: `@lynx-js/web-platform`
 * does exactly this, reimplementing the PAPI in JavaScript over custom
 * elements. This is a small honest subset of the same idea.
 *
 * What that buys is that there is no second renderer to keep in step. The
 * runtime above this line is the code that ships to a device, byte for byte,
 * exercising the same creators, the same attribute names and the same worklet
 * dispatch path. The preview can be wrong about how something LOOKS; it cannot
 * be wrong about what the runtime DID.
 *
 * ## Elements keep their Lynx names
 *
 * `__CreateElement('view', …)` produces `<view>`, not a `<div>`. Mapping to
 * HTML tags would throw away most of the value of a preview: with the Lynx
 * names kept, the browser's inspector shows the same tree the Lynx devtool
 * would, attribute for attribute. The cost is that the browser knows nothing
 * about any of them, which is what `install-lynx-reset.ts` is for.
 *
 * ## What this target is structurally blind to
 *
 * Four things, all worth knowing before trusting a green preview:
 *
 * - **Missing flushes.** The DOM is eager, so `__FlushElementTree` is a no-op
 *   and a mutation that never gets committed still appears here. See below.
 * - **Layout.** Linear is approximated with flex; `linear-weight` and the
 *   `relative-*` family have no CSS equivalent at all.
 * - **Propagation for non-touch events.** Lynx's response chain is a single
 *   node for anything that is not a touch, so `scroll` does not bubble there
 *   and does here.
 * - **The background thread.** A string listener has nowhere to go in a
 *   browser; there is no second runtime to route it to.
 */
export const createDomPapi = ({
  root,
  onPublishEvent = warnAboutPublishedEvent,
}: DomPapiOptions = {}): LynxElementApi => {
  const container = root ?? document.body
  const ownerDocument = container.ownerDocument
  installLynxReset(ownerDocument)

  /**
   * The page element, which on a device the engine already owns by the time an
   * app runs. Building it here is this shim taking that job on, and it carries
   * the attribute the reset is scoped to — so the stylesheet reaches the app
   * tree and nothing else on the page.
   */
  const page = ownerDocument.createElement('page')
  page.setAttribute(LYNX_ROOT_ATTRIBUTE, '')
  container.append(page)

  const create = (tag: string): LynxElement => toLynx(ownerDocument.createElement(tag))

  /** One registration per element per `(type, name)` pair — the engine's own constraint. */
  const registrations = new WeakMap<Element, Map<string, Registration>>()

  return {
    // Every creator is implemented, because the runtime now REQUIRES the
    // dedicated ones for the tags that have them: on a device a `view` built
    // through `__CreateElement` is not a view. Here they are all the same call,
    // and implementing them anyway keeps the preview on the code path the
    // device takes rather than on the fallback.
    __CreateElement: (tag) => create(tag),
    __CreateView: () => create('view'),
    __CreateText: () => create('text'),
    __CreateImage: () => create('image'),
    __CreateScrollView: () => create('scroll-view'),
    __CreateFrame: () => create('frame'),

    /**
     * A `list`, wired to drive its recycler from the browser's own scrolling.
     *
     * This is the one creator that does more than name a tag, because a
     * recycling list is the one place the engine calls the FRAMEWORK: nothing at
     * all appears until something invokes `componentAtIndex`. A shim that
     * ignored the callbacks would render an empty box and look like a bug in
     * `/recycle` rather than a gap in the preview.
     *
     * So this drives the protocol — the same calls, in the same order, with the
     * same `operationID` correlation a device uses — off a scroll listener and
     * measured row offsets. What it is NOT is Lynx's virtualiser: the windowing
     * maths here is this file's, it assumes a single column, and it measures
     * rather than predicting. Trust it about the protocol and about which rows
     * are realised; do not read anything into how it performs.
     */
    __CreateList: (_owner, componentAtIndex, enqueueComponent) => {
      const element = fromLynx(create('list'))
      installListRecycler(element, componentAtIndex, enqueueComponent)
      return toLynx(element)
    },

    /**
     * Swaps a list's callbacks, which is how a recycler is torn down.
     *
     * Implementing it is not optional for a preview: the framework installs an
     * inert pair when its list goes away, and a shim that ignored them would go
     * on calling the old closures from its next scroll frame — building cells
     * against a pool that no longer exists, and against whatever engine happens
     * to be installed by then.
     */
    __UpdateListCallbacks: (list, componentAtIndex, enqueueComponent) => {
      updateListRecycler(fromLynx(list), componentAtIndex, enqueueComponent)
    },

    __CreateRawText: (text) => {
      const element = ownerDocument.createElement('raw-text')
      element.setAttribute('text', text)
      // The attribute is the source of truth and the rendered text follows it,
      // exactly as `__SetAttribute(el, 'text', …)` will keep doing from here on.
      element.textContent = text
      return toLynx(element)
    },

    __CreateWrapperElement: () => create('wrapper'),

    __GetElementUniqueID: (element) => elementUniqueId(fromLynx(element)),

    __AppendElement: (parent, child) => {
      fromLynx(parent).append(fromLynx(child))
    },

    __InsertElementBefore: (parent, child, anchor) => {
      fromLynx(parent).insertBefore(fromLynx(child), anchor === undefined ? null : fromLynx(anchor))
    },

    __RemoveElement: (parent, child) => {
      const node = fromLynx(child)
      // Guarded rather than trusting the caller, because `removeChild` throws
      // on a node that is not there while the engine simply does nothing.
      if (node.parentNode === fromLynx(parent)) node.remove()
    },

    __GetParent: (element) => {
      const parent = fromLynx(element).parentElement
      return parent === null ? null : toLynx(parent)
    },

    __GetPageElement: () => toLynx(page),

    __GetChildren: (element) => [...fromLynx(element).children].map((child) => toLynx(child as HTMLElement)),

    __FirstElement: (element) => {
      const first = fromLynx(element).firstElementChild
      return first === null ? null : toLynx(first as HTMLElement)
    },

    __NextElement: (element) => {
      const next = fromLynx(element).nextElementSibling
      return next === null ? null : toLynx(next as HTMLElement)
    },

    __SetAttribute: (element, name, value) => {
      const target = fromLynx(element)
      // Reflected under the LYNX name first, so the inspector shows the tree a
      // device would; the table afterwards is what makes a few of them do
      // something a browser can see.
      if (value === null || value === undefined) target.removeAttribute(name)
      else target.setAttribute(name, typeof value === 'object' ? JSON.stringify(value) : String(value))
      // A list's inventory is an object, and `String(value)` would flatten it to
      // `[object Object]`. The engine receives the real thing, so the recycler
      // is handed the real thing too — see `inventories`.
      if (name === 'update-list-info' && value !== null && typeof value === 'object') {
        inventories.get(target)?.(value as ListInventory)
      }
      applyPreviewAttribute(target, name, value)
    },

    __GetAttributes: (element) => {
      const attributes: Record<string, unknown> = {}
      for (const attribute of fromLynx(element).attributes) attributes[attribute.name] = attribute.value
      return attributes
    },

    __SetID: (element, id) => {
      const target = fromLynx(element)
      if (id === null || id === undefined) target.removeAttribute('id')
      else target.id = id
    },

    __SetClasses: (element, classes) => {
      fromLynx(element).className = classes
    },

    __SetInlineStyles: (element, styles) => {
      const target = fromLynx(element)
      // A replacement, matching the engine: whatever was there is gone.
      target.style.cssText = ''
      if (typeof styles === 'string') target.style.cssText = styles
      else for (const [name, value] of Object.entries(styles)) target.style.setProperty(name, value)
      // …which would also take the preview's own declarations with it, so they
      // go back on top. See `apply-preview-attribute.ts`.
      reassertPreviewStyles(target)
    },

    __AddInlineStyle: (element, name, value) => {
      const target = fromLynx(element)
      if (value === null || value === undefined) {
        target.style.removeProperty(name)
        reassertPreviewStyles(target)
        return
      }
      target.style.setProperty(name, String(value))
    },

    /**
     * Registers a listener, reproducing the engine's constraints rather than
     * smoothing them over.
     *
     * **A function is rejected.** The published signature says `string |
     * Function`, and a device engine accepts a closure, stores it, and then
     * never calls it. A preview that quietly worked where the device is silent
     * would be worse than useless, so this throws — the same choice
     * `@lynx-js/testing-environment` and this repo's own fake engine make.
     *
     * **A worklet handle goes through `runWorklet`.** The engine hands the
     * token back to a global the FRAMEWORK installed, and the runtime installs
     * it lazily on its first listener, so it is read at dispatch time rather
     * than captured here. Routing through it means the playground exercises the
     * same dispatch path a device does, registry and all.
     *
     * **One listener per (type, name), overwriting silently.** That constraint
     * is the entire reason `add-event.ts` keeps a fan-out layer, and a
     * permissive shim here would make that layer untestable.
     */
    __AddEvent: (element, type, name, listener) => {
      const target = fromLynx(element)
      if (typeof listener === 'function') {
        throw new TypeError('__AddEvent listener must be a string or a worklet handle, not a function.')
      }

      const key = `${type}:${name}`
      const byKey = registrations.get(target) ?? new Map<string, Registration>()
      registrations.set(target, byKey)

      const previous = byKey.get(key)
      if (previous) {
        previous.target.removeEventListener(previous.dom, previous.listener, previous.capture)
        byKey.delete(key)
      }

      if (listener === null) return

      if (typeof listener === 'string') {
        // On a device this names a handler the engine routes to the background
        // thread. A browser has no background thread and no handler table to
        // look it up in, so the registration is reported and then does nothing
        // — visible rather than silent, because a listener that never fires is
        // otherwise indistinguishable from one that was never registered.
        onPublishEvent(name, listener)
        return
      }

      const binding = LYNX_EVENTS[name]
      const dom = binding?.dom ?? name
      // `global-bindEvent` is in this list as well as the two obvious ones, and
      // it was the bug here: computing capture from the `capture-` prefixes
      // alone left a global listener on the document in the BUBBLE phase, so it
      // fired last and a `catch` anywhere upstream silenced it — the opposite of
      // "hears events from anywhere in the tree".
      const capture = type === 'capture-bind' || type === 'capture-catch' || type === 'global-bindEvent'
      // `catch` intercepts propagation; `bind` does not. That is the whole
      // difference between the two, and the DOM has the same knob.
      const catches = type === 'catchEvent' || type === 'capture-catch'
      // A `global-bind` listener hears events from anywhere in the tree rather
      // than only from its own response chain. The document in the CAPTURE
      // phase is the closest a browser gets, and capture matters: `scroll` and
      // the other custom events do not bubble to the document at all.
      // `global-target`, which narrows this to specific ids, is not reproduced.
      const listenerTarget: EventTarget = type === 'global-bindEvent' ? ownerDocument : target

      const domListener = (event: Event): void => {
        const payload = toLynxEvent(name, event, target)
        // `null` means this DOM event was not the Lynx one after all — a
        // keystroke that was not Enter standing in for `confirm`.
        if (payload === null) return
        if (catches) event.stopPropagation()
        const runWorklet = (globalThis as WorkletHost).runWorklet
        runWorklet?.(listener.value, [payload])
      }

      listenerTarget.addEventListener(dom, domListener, capture)
      byKey.set(key, { dom, capture, listener: domListener, target: listenerTarget })
    },

    /**
     * The engine's UI methods — the actions that are not state.
     *
     * Only the ones a browser can answer honestly are implemented, and
     * everything else reports the engine's own "this element does not implement
     * that" rather than a plausible zero. A preview that invented a rect would
     * be worse than one that admits it cannot measure: keyboard avoidance is
     * arithmetic over rects, and it would silently move things by the wrong
     * amount here while looking fine.
     *
     * `boundingClientRect` is the interesting one, and it is genuinely the same
     * question in both places — the browser's own answer, in CSS pixels, in the
     * viewport's coordinate space, which is the space Lynx reports it in too.
     */
    __InvokeUIMethod: (element, method, _params, callback) => {
      const target = fromLynx(element)

      if (method === 'boundingClientRect') {
        const rect = target.getBoundingClientRect()
        callback({ code: 0, data: rect.toJSON() as Record<string, number> })
        return
      }

      if (method === 'scrollIntoView') {
        target.scrollIntoView({ block: 'nearest' })
        callback({ code: 0, data: {} })
        return
      }

      callback({ code: -1, data: `the preview engine does not implement "${method}"` })
    },

    /**
     * Nothing to commit: the DOM is eager, so every mutation above already
     * reached the screen.
     *
     * Worth stating plainly, because it is the one class of defect this target
     * cannot show you. A runtime that mutates the tree without scheduling a
     * flush renders perfectly here and renders NOTHING on a device until
     * something else happens to commit — which looks like a race rather than
     * like the missing call it is. The package's own suite is where that is
     * caught: its fake engine counts flushes.
     */
    __FlushElementTree: () => {},
  }
}

export type DomPapiOptions = {
  /**
   * Where the page element is attached. Defaults to `document.body`.
   *
   * Passing the app's own container is what keeps the layout reset off the rest
   * of the page — the reset is scoped to the page element, and the page element
   * lands wherever this points.
   */
  root?: HTMLElement
  /**
   * Called when the runtime registers a STRING listener, which a browser has
   * nowhere to route to. Defaults to a one-off console warning.
   */
  onPublishEvent?: (name: string, handler: string) => void
}

/** What one live listener costs us to remember, so re-registering can undo it. */
type Registration = {
  readonly dom: string
  readonly capture: boolean
  readonly listener: (event: Event) => void
  /** The document for a `global-bind` listener, the element for every other kind. */
  readonly target: EventTarget
}

/** The global the engine calls at dispatch time, installed by the runtime. */
type WorkletHost = { runWorklet?: (value: unknown, args: unknown[]) => unknown }

/** Warns once per handler name, so a re-render does not fill the console. */
const warnAboutPublishedEvent = (name: string, handler: string): void => {
  const key = `${name}:${handler}`
  if (warned.has(key)) return
  warned.add(key)
  console.warn(
    `[dom-papi] "${handler}" was registered for "${name}" as a background-thread handler, which this preview cannot route.`,
  )
}

const warned = new Set<string>()

/*
 * The engine's element type is opaque to everyone, including this shim. Casting
 * at the two crossings keeps the rest of the file typed against real DOM nodes,
 * which is the same arrangement a device engine has on its own side.
 */
const toLynx = (element: HTMLElement | Element): LynxElement => element as unknown as LynxElement
const fromLynx = (element: LynxElement): HTMLElement => element as unknown as HTMLElement

/**
 * The inventory sink for each recycling list, so `__SetAttribute` can hand
 * `update-list-info` to the recycler as the OBJECT the framework wrote.
 *
 * Routed rather than read back off the element because a DOM attribute is a
 * string: `setAttribute(name, String(value))` turns the inventory into
 * `[object Object]`, and a shim that then tried to parse it would find a list of
 * zero rows and render nothing. On a device the engine receives the real object,
 * so passing it through here keeps the preview on the same value the device sees
 * — the attribute is still reflected for the inspector, it is simply not the
 * channel.
 */
const inventories = new WeakMap<HTMLElement, (info: ListInventory) => void>()

/** The live callbacks for each recycling list, so `__UpdateListCallbacks` can swap them. */
const listCallbacks = new WeakMap<HTMLElement, ListCallbacks>()

type ListCallbacks = {
  componentAtIndex: (list: LynxElement, listID: number, index: number, operationID: number) => number
  enqueueComponent: (list: LynxElement, listID: number, sign: number) => void
}

/** Swaps a list's callbacks in place, leaving its scroll wiring alone. */
const updateListRecycler = (
  list: HTMLElement,
  componentAtIndex: ListCallbacks['componentAtIndex'],
  enqueueComponent: ListCallbacks['enqueueComponent'],
): void => {
  const existing = listCallbacks.get(list)
  if (!existing) return
  existing.componentAtIndex = componentAtIndex
  existing.enqueueComponent = enqueueComponent
}

/** The shape `/recycle` publishes: edits against the previous inventory. */
type ListInventory = {
  insertAction?: { position: number }[]
  removeAction?: number[]
  updateAction?: unknown[]
}

/**
 * Drives a recycling `<list>`'s callbacks from the browser's scrolling.
 *
 * The protocol is the device's, and reproducing it exactly is the point:
 *
 * 1. The framework publishes its inventory, so this tracks how many cells exist.
 * 2. For each row entering the window, `componentAtIndex(list, listID, index,
 *    operationID)` is called and answers with the cell's engine id.
 * 3. For each row leaving it, `enqueueComponent(list, listID, sign)` hands the
 *    cell back.
 *
 * The windowing itself is this shim's invention. A real engine knows every row's
 * height before it lays anything out; a browser knows only what it has already
 * rendered, so this measures the cells it has and estimates the rest. That makes
 * the window occasionally a row too generous, which changes nothing about what
 * the runtime above is asked to do — the calls, their order and their
 * correlation tokens are the device's.
 */
const installListRecycler = (
  list: HTMLElement,
  componentAtIndex: ListCallbacks['componentAtIndex'],
  enqueueComponent: ListCallbacks['enqueueComponent'],
): void => {
  // Held in a mutable record rather than closed over, so `__UpdateListCallbacks`
  // can replace them without re-wiring the scroll listener.
  const callbacks: ListCallbacks = { componentAtIndex, enqueueComponent }
  listCallbacks.set(list, callbacks)

  /** Rows currently realised, by data index, holding the id the framework answered with. */
  const realised = new Map<number, number>()
  let total = 0
  let operationId = 1
  let scheduled = false

  /** The average height of what has been rendered — the best estimate available here. */
  const rowHeight = (): number => {
    const cells = [...list.children] as HTMLElement[]
    if (cells.length === 0) return ESTIMATED_ROW_HEIGHT
    const sum = cells.reduce((run, cell) => run + cell.offsetHeight, 0)
    return sum / cells.length || ESTIMATED_ROW_HEIGHT
  }

  const sync = (): void => {
    scheduled = false
    if (total === 0) {
      for (const [index, sign] of realised) {
        callbacks.enqueueComponent(toLynx(list), elementUniqueId(list), sign)
        realised.delete(index)
      }
      return
    }

    const height = rowHeight()
    const first = Math.max(0, Math.floor(list.scrollTop / height) - OVERSCAN)
    const last = Math.min(total - 1, first + Math.ceil(list.clientHeight / height) + OVERSCAN * 2)

    for (const [index, sign] of realised) {
      if (index < first || index > last) {
        callbacks.enqueueComponent(toLynx(list), elementUniqueId(list), sign)
        realised.delete(index)
      }
    }
    for (let index = first; index <= last; index++) {
      if (realised.has(index)) continue
      const sign = callbacks.componentAtIndex(toLynx(list), elementUniqueId(list), index, operationId++)
      // -1 is the framework saying "no such row", which happens when an
      // inventory and the data are a commit apart. The engine skips too.
      if (sign !== -1) realised.set(index, sign)
    }
  }

  const schedule = (): void => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(sync)
  }

  inventories.set(list, (info) => {
    // Applied once per published inventory, because it describes EDITS. Reading
    // it back off the element on every scroll would re-apply the same diff and
    // walk the row count away from the truth.
    total = Math.max(0, total + (info.insertAction?.length ?? 0) - (info.removeAction?.length ?? 0))
    // Every realised cell may now be showing the wrong row, so they are handed
    // back and re-requested rather than left in place.
    for (const [index, sign] of realised) {
      callbacks.enqueueComponent(toLynx(list), elementUniqueId(list), sign)
      realised.delete(index)
    }
    schedule()
  })

  list.addEventListener('scroll', schedule, { passive: true })
}

/** What a row is assumed to be before anything has been measured. */
const ESTIMATED_ROW_HEIGHT = 48

/** Rows kept realised beyond each edge of the viewport, so a scroll has slack. */
const OVERSCAN = 3
