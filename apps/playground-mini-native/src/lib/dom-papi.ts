import type { LynxElement, LynxElementApi } from '@amritk/mini-native/engine'

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
    __CreateList: () => create('list'),

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
      else target.setAttribute(name, String(value))
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
