import type { LynxElement, LynxElementApi } from '@amritk/mini-native/hosts/lynx'

/**
 * A stand-in for the Lynx engine, running inside the browser preview.
 *
 * The whole reason `createLynxHost` takes its Element PAPI as an argument
 * rather than reading the engine globals is so that this can exist: the
 * adapter's mapping can be driven with no engine, no device and no emulator
 * anywhere in the loop. The package's own suite uses a fake of exactly this
 * shape; this one additionally RECORDS every call, because on the `/lynx`
 * screen the call log is the thing worth looking at.
 *
 * It is a fake rather than a simulator. It maintains the tree faithfully and
 * reports what it was asked to do; it does not lay anything out, and nothing it
 * holds ever reaches a pixel. What it is evidence for is the mapping — element
 * creation, text representation, attribute names, style stringification, event
 * registration, tree surgery — which is exactly the part of a native target
 * that a browser cannot otherwise show you.
 */
export type FakeLynxElement = {
  /** A stable handle, so the call log can name the element a call was about. */
  readonly id: number
  readonly tag: string
  attrs: Record<string, unknown>
  styles: Record<string, string>
  classes: string
  /** One listener per `type:name`, which is the engine's real constraint — see below. */
  events: Map<string, ((event: unknown) => void) | null>
  children: FakeLynxElement[]
  parent: FakeLynxElement | null
}

export type FakeLynxEngine = {
  /** The PAPI to hand to `createLynxHost`. */
  readonly api: LynxElementApi
  /** The page element, as the engine would already own it. */
  readonly root: FakeLynxElement
  /**
   * The same node as {@link FakeLynxEngine.root}, typed the way the PAPI hands
   * elements out — so `lynxRoot(engine.rootElement)` needs no cast at the call
   * site, exactly as `memory.rootElement` spares one.
   */
  readonly rootElement: LynxElement
  /** How many times the tree has been committed — the flush-coalescing readout. */
  flushes: () => number
  /** Every PAPI call since the last clear, oldest first. */
  log: () => readonly string[]
  clearLog: () => void
  /**
   * Fires an engine event at an element, the way the engine would.
   *
   * The payload is the engine's shape, not the vocabulary's — a tap arrives
   * under `detail`, a scroll as `scrollLeft`/`scrollTop` — which is the point:
   * whatever a handler receives on the other side has been normalised by the
   * host rather than by the app.
   */
  dispatch: (element: FakeLynxElement, name: string, event: unknown) => void
}

/** Creates one fake engine. Each call is an independent tree with its own log. */
export const createFakeLynxEngine = (): FakeLynxEngine => {
  let flushes = 0
  let nextId = 0
  let log: string[] = []

  const record = (line: string): void => {
    log.push(line)
    // A log nobody trims grows for as long as the screen is open, and the
    // interesting calls are always the most recent ones.
    if (log.length > 400) log = log.slice(-400)
  }

  const element = (tag: string): FakeLynxElement => ({
    id: nextId++,
    tag,
    attrs: {},
    styles: {},
    classes: '',
    events: new Map(),
    children: [],
    parent: null,
  })

  const root = element('page')

  const api: LynxElementApi = {
    __CreateElement: (tag) => {
      const created = element(tag)
      record(`__CreateElement("${tag}", 0) → #${created.id}`)
      return toLynx(created)
    },
    __SetAttribute: (el, name, value) => {
      const target = fromLynx(el)
      record(`__SetAttribute(#${target.id}, "${name}", ${format(value)})`)
      if (value === null) delete target.attrs[name]
      else target.attrs[name] = value
    },
    __GetAttributes: (el) => fromLynx(el).attrs,
    __SetInlineStyles: (el, styles) => {
      const target = fromLynx(el)
      record(`__SetInlineStyles(#${target.id}, ${format(styles)})`)
      target.styles = typeof styles === 'string' ? {} : { ...styles }
    },
    __AddInlineStyle: (el, name, value) => {
      const target = fromLynx(el)
      record(`__AddInlineStyle(#${target.id}, "${name}", ${format(value)})`)
      target.styles[name] = String(value)
    },
    __SetClasses: (el, classes) => {
      const target = fromLynx(el)
      record(`__SetClasses(#${target.id}, "${classes}")`)
      target.classes = classes
    },
    __AppendElement: (parent, child) => {
      const target = fromLynx(parent)
      const node = fromLynx(child)
      record(`__AppendElement(#${target.id}, #${node.id})`)
      target.children.push(node)
      node.parent = target
    },
    __InsertElementBefore: (parent, child, anchor) => {
      const target = fromLynx(parent)
      const node = fromLynx(child)
      const before = fromLynx(anchor)
      record(`__InsertElementBefore(#${target.id}, #${node.id}, #${before.id})`)
      const at = target.children.indexOf(before)
      target.children.splice(at === -1 ? target.children.length : at, 0, node)
      node.parent = target
    },
    __RemoveElement: (parent, child) => {
      const target = fromLynx(parent)
      const node = fromLynx(child)
      record(`__RemoveElement(#${target.id}, #${node.id})`)
      const at = target.children.indexOf(node)
      if (at !== -1) target.children.splice(at, 1)
      node.parent = null
    },
    __GetParent: (el) => {
      const parent = fromLynx(el).parent
      return parent === null ? null : toLynx(parent)
    },
    __GetChildren: (el) => fromLynx(el).children.map(toLynx),
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
    __AddEvent: (el, type, name, listener) => {
      const target = fromLynx(el)
      record(`__AddEvent(#${target.id}, "${type}", "${name}", ${listener === null ? 'null' : 'fn'})`)
      // Only ONE listener is kept per type-and-name pair, and overwriting is
      // silent. That is the engine's real behaviour and it is reproduced rather
      // than smoothed over, because working around it is something the host
      // does — it registers a single dispatcher per name and fans out to its own
      // handler set, which is what restores add-many semantics for callers.
      target.events.set(`${type}:${name}`, listener)
    },
    __FlushElementTree: () => {
      flushes++
      record('__FlushElementTree()')
    },
  }

  return {
    api,
    root,
    rootElement: toLynx(root),
    flushes: () => flushes,
    log: () => log,
    clearLog: () => {
      log = []
    },
    dispatch: (element_, name, event) => {
      element_.events.get(`bindEvent:${name}`)?.(event)
    },
  }
}

/** Renders a value the way the log should show it — short, and obviously a value. */
const format = (value: unknown): string =>
  typeof value === 'string'
    ? `"${value}"`
    : typeof value === 'object' && value !== null
      ? JSON.stringify(value)
      : String(value)

/*
 * The engine's element type is opaque to everyone, including this fake. Casting
 * at the two crossings keeps the rest of the file typed against the real node
 * shape, which is the same arrangement the host itself uses.
 */
const toLynx = (node: FakeLynxElement): LynxElement => node as unknown as LynxElement
const fromLynx = (node: LynxElement): FakeLynxElement => node as unknown as FakeLynxElement
