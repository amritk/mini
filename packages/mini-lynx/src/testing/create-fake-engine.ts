import type { EventListenerValue, LynxElement, LynxElementApi } from '../engine/element-api'

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
    if (calls.length > 1000) calls = calls.slice(-1000)
  }

  const element = (tag: string): FakeElement => ({
    id: nextId++,
    tag,
    attrs: {},
    styles: {},
    classes: '',
    elementId: null,
    events: new Map(),
    children: [],
    parent: null,
  })

  const page = element('page')
  const published: { handler: string; event: unknown }[] = []

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

    __FlushElementTree: () => {
      flushes++
      record('__FlushElementTree()')
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
    calls: () => calls,
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
    find: (tag) => collect((node) => node.tag === tag)[0],
    findAll: (tag) => collect((node) => node.tag === tag),
    findByTestId: (testId) => collect((node) => node.attrs['data-testid'] === testId)[0],
    publishedEvents: () => published,
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
