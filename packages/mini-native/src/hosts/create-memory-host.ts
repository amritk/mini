import type { Host, HostEventHandler } from '../host'
import type { HostElement, HostNode, HostText, StyleValue } from '../types'
import { NAMED_EVENTS_WITHOUT_DATA } from './named-events'
import { isAbsent, TRI_STATE_PROPS } from './tri-state-props'

/** An element in the in-memory tree. */
export type MemoryElement = {
  readonly kind: 'element'
  readonly tag: string
  readonly props: Record<string, unknown>
  readonly listeners: Map<string, Set<HostEventHandler>>
  readonly children: MemoryNode[]
  style: StyleValue | null
  visible: boolean
  parent: MemoryElement | null
}

/** A text node in the in-memory tree. */
export type MemoryText = {
  readonly kind: 'text'
  value: string
  parent: MemoryElement | null
}

export type MemoryNode = MemoryElement | MemoryText

/** What {@link createMemoryHost} hands back: the host plus a way to reach the tree it builds. */
export type MemoryHost = {
  host: Host
  /** The tree root. Mount into this and inspect it afterwards. */
  root: MemoryElement
  /** The root typed for the runtime, so it can be passed straight to `mount`. */
  rootElement: HostElement
}

/**
 * A headless host that renders into plain JavaScript objects.
 *
 * This is the reference implementation of the {@link Host} contract — it is the
 * shortest complete example of what a new target has to provide, and it is
 * small enough to read in one sitting before writing a real one.
 *
 * It also earns its place in the test suite twice over. It makes assertions
 * about structure trivial, and because it involves no platform at all, a test
 * that renders through it PROVES the runtime is free of any DOM dependency:
 * these tests run under Bun, where `document` genuinely does not exist, so a
 * stray platform call could not possibly pass unnoticed.
 */
export const createMemoryHost = (): MemoryHost => {
  const root = element('root')

  const host: Host = {
    platform: 'memory',

    // No `environment`, on purpose. This host has no screen, so it has no
    // colour scheme, no size, and no notch to report — and leaving the field
    // off is what exercises the runtime's documented fallbacks on every test
    // run rather than only when someone remembers to check them.
    createElement: (tag) => toHostElement(element(tag)),

    // Nothing in an object tree needs a layout escape hatch, so the flow
    // wrapper is just an ordinary element — the same choice a native host
    // makes, where a container view is the idiomatic wrapper anyway.
    //
    // It still carries the presentational marker both real hosts set, so a test
    // asserting that a framework-inserted wrapper stays out of the
    // accessibility tree can be written against this host too. That matters
    // more than it looks: the memory host missing a distinction is exactly how
    // the visibility bug survived its own test suite.
    createFlowHost: () => {
      const wrapper = element('flow')
      wrapper.props['role'] = 'presentation'
      return toHostElement(wrapper)
    },

    createText: (value) => toHostText({ kind: 'text', value, parent: null }),

    setText: (node, value) => {
      fromHostText(node).value = value
    },

    setProperty: (target, name, value) => {
      const el = fromHostElement(target)
      // `false` is a stated value for a handful of props rather than an absence,
      // so dropping it here would erase what the author actually said — and the
      // parity suite found exactly that, with the DOM host honouring it and this
      // one silently not.
      const unset = TRI_STATE_PROPS.has(name) ? isAbsent(value) : value === false || isAbsent(value)
      if (unset) delete el.props[name]
      else el.props[name] = value
    },

    getProperty: (target, name) => fromHostElement(target).props[name],

    setStyle: (target, value) => {
      fromHostElement(target).style = value
    },

    setVisible: (target, visible) => {
      fromHostElement(target).visible = visible
    },

    addEventListener: (target, name, handler) => {
      const el = fromHostElement(target)
      const existing = el.listeners.get(name) ?? new Set<HostEventHandler>()
      // Normalised here as well, even though there is no platform to normalise
      // FROM, because the contract says a handler receives the framework's
      // payload shape and this host is the reference implementation of that
      // contract. Passing the dispatched object straight through would let a
      // test assert a shape neither real host produces — which is precisely how
      // the visibility bug survived this suite once already.
      const listener: HostEventHandler = (event) => handler(toNativeEvent(name, event))
      existing.add(listener)
      el.listeners.set(name, existing)
      // The WRAPPER is what has to be removed, not the handler that was passed
      // in — deleting the latter would find nothing in the set and leave the
      // listener attached forever.
      return () => {
        existing.delete(listener)
      }
    },

    insert: (parent, node, anchor) => {
      const parentEl = fromHostElement(parent)
      const child = requireMemoryNode(node)
      // Detach first so an insert doubles as a move, which is exactly what the
      // list reconciler relies on when rows change position.
      detach(child)
      const at = anchor === null ? -1 : parentEl.children.indexOf(fromHostNode(anchor))
      if (at === -1) parentEl.children.push(child)
      else parentEl.children.splice(at, 0, child)
      child.parent = parentEl
    },

    remove: (node) => detach(fromHostNode(node)),

    clear: (target) => {
      const el = fromHostElement(target)
      for (const child of el.children) child.parent = null
      el.children.length = 0
    },

    firstChild: (target) => {
      const first = fromHostElement(target).children[0]
      return first === undefined ? null : toHostNode(first)
    },

    nextSibling: (node) => {
      const child = fromHostNode(node)
      const siblings = child.parent?.children
      if (!siblings) return null
      const next = siblings[siblings.indexOf(child) + 1]
      return next === undefined ? null : toHostNode(next)
    },
  }

  return { host, root, rootElement: toHostElement(root) }
}

/**
 * Turns a dispatched object into the shape the vocabulary promises.
 *
 * There is no platform here to translate from, so a test supplies the semantic
 * fields directly — `dispatchMemoryEvent(row, 'scroll', { y: 120 })` — and this
 * adds what the contract guarantees around them. That makes the reference host
 * demonstrate the rule rather than sidestep it, without inventing a fake
 * platform encoding for tests to learn.
 */
const toNativeEvent = (name: string, event: unknown): unknown => {
  const source = (event ?? {}) as Record<string, unknown>

  if (name === 'tap' || name === 'longpress') {
    const x = source['x']
    const y = source['y']
    // A tap with no position is a real case on both real targets — a keyboard
    // activation, an accessibility action — so it has to be expressible here.
    return typeof x === 'number' && typeof y === 'number' ? { x, y, raw: event } : { raw: event }
  }

  if (name === 'scroll') {
    return { x: numberOr(source['x']), y: numberOr(source['y']), raw: event }
  }

  if (name === 'pointer') {
    // `phase` defaults to `move` rather than `down`, so a test that forgets it
    // describes the phase a gesture spends most of its time in instead of
    // silently starting a new one.
    const phase = source['phase']
    return {
      id: numberOr(source['id']),
      x: numberOr(source['x']),
      y: numberOr(source['y']),
      phase: typeof phase === 'string' ? phase : 'move',
      raw: event,
    }
  }

  if (name === 'input' || name === 'change' || name === 'submit') {
    return { value: String(source['value'] ?? ''), raw: event }
  }

  if (NAMED_EVENTS_WITHOUT_DATA.has(name)) return { raw: event }
  return event
}

/** Reads a numeric field, treating anything else as a zero offset. */
const numberOr = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

/** Builds a bare element with every field initialised, so no consumer sees a partial node. */
const element = (tag: string): MemoryElement => ({
  kind: 'element',
  tag,
  props: {},
  listeners: new Map(),
  children: [],
  style: null,
  visible: true,
  parent: null,
})

/**
 * Checks that something really is a node this host made, before it is linked
 * into the tree.
 *
 * Every host crosses the opaque-handle boundary with a cast, and a cast believes
 * whatever it is told — so anything that slips past the types (a `Date`, a plain
 * object, a promise) lands in the tree as a child that nothing can render or
 * serialise, and the failure surfaces somewhere far away. This host is also the
 * test host, which makes a loud error here worth far more than the microscopic
 * cost of the check: a test that hands over the wrong thing says so immediately.
 */
const requireMemoryNode = (node: HostNode): MemoryNode => {
  const candidate = node as unknown
  if (typeof candidate === 'object' && candidate !== null) {
    const kind = (candidate as { kind?: unknown }).kind
    if (kind === 'element' || kind === 'text') return candidate as MemoryNode
  }
  throw new TypeError(
    `The memory host can only insert nodes it created, and received ${String(candidate)} instead. ` +
      'A value like this usually reaches the tree as a child that is neither a host node, a string, ' +
      'nor a function — convert it to a string first.',
  )
}

/** Unlinks a node from whatever parent currently holds it. */
const detach = (node: MemoryNode): void => {
  const parent = node.parent
  if (!parent) return
  const at = parent.children.indexOf(node)
  if (at !== -1) parent.children.splice(at, 1)
  node.parent = null
}

/*
 * The runtime treats host nodes as opaque handles, which is what keeps it from
 * ever depending on a particular platform's node type. Every host therefore
 * crosses that boundary with a cast, and confining those casts to the four
 * helpers below means the rest of the adapter stays fully typed against its own
 * concrete types.
 */
const toHostElement = (node: MemoryElement): HostElement => node as unknown as HostElement
const toHostText = (node: MemoryText): HostText => node as unknown as HostText
const toHostNode = (node: MemoryNode): HostNode => node as unknown as HostNode
const fromHostElement = (node: HostElement): MemoryElement => node as unknown as MemoryElement
const fromHostText = (node: HostText): MemoryText => node as unknown as MemoryText
const fromHostNode = (node: HostNode): MemoryNode => node as unknown as MemoryNode
