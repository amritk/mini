import type { Host, HostEnvironment, HostEventHandler } from '../host'
import type { HostElement, HostNode, HostText, StyleValue } from '../types'
import { globalLynxApi, type LynxElement, type LynxElementApi } from './lynx-element-api'
import { createTransitionAnimator } from './lynx-transition-animator'
import { NAMED_EVENTS_WITHOUT_DATA } from './named-events'
import { toStyleText } from './to-style-text'
import { isAbsent, TRI_STATE_PROPS } from './tri-state-props'

/**
 * A host that renders onto Lynx, driving its Element PAPI directly.
 *
 * Lynx is the natural target for this framework. Its element tree is MUTABLE
 * and imperative — create a node, set an attribute, append a child — which is
 * exactly the shape a runtime with no virtual tree needs. The PAPI exists in
 * the first place so that frameworks other than React can drive the engine, so
 * this adapter is using it as intended rather than working around anything.
 *
 * Contrast that with a renderer whose tree is immutable and rebuilt on every
 * change: there, each attribute write would turn into a whole-tree commit,
 * because there would be no way to mutate a node in place. That mismatch is the
 * single biggest thing to check before pointing this runtime at a new target.
 *
 * Nothing reaches the screen until the tree is flushed, so this host defines
 * `flush` and lets the scheduler coalesce a whole tick of mutations into one
 * commit.
 *
 * **Everything outside the element tree is passed IN rather than read from the
 * engine**, which is worth explaining because it looks like a gap. This adapter
 * drives the Element PAPI, and that subset is element-level: create a node, set
 * an attribute, append a child. Colour scheme, viewport, safe-area insets, and
 * moving focus all live elsewhere — on system-information globals and UI-method
 * calls that are not part of the PAPI, vary by engine version, and, unlike the
 * PAPI, this package has no way to exercise against a fake. Guessing at their
 * names would mean shipping a host that behaves plausibly on some builds and
 * silently wrongly on others, which is worse than asking the app, which knows
 * exactly which engine it is running on. Omit them and the accessors report
 * their documented static values and `focus` is a no-op.
 *
 * ```ts
 * setHost(createLynxHost(undefined, {
 *   environment: { safeArea: () => insetsFromYourEngine() },
 *   focus: (element) => yourEngineFocus(element),
 * }))
 * ```
 *
 * @param api The Element PAPI. Defaults to the engine globals; pass a fake to
 *   exercise the adapter off-device.
 * @param options What the engine can do beyond its element tree. See above for
 *   why these are supplied rather than discovered.
 */
export const createLynxHost = (api: LynxElementApi = globalLynxApi(), options: LynxHostOptions = {}): Host => {
  /**
   * Handlers registered per element and event name.
   *
   * Lynx keeps only one listener per event, so registering a second would
   * silently drop the first. Instead a single dispatcher is registered per name
   * and the real handlers are fanned out from here, which restores the
   * add-many semantics every other host provides.
   */
  const handlers = new WeakMap<LynxElement, Map<string, Set<HostEventHandler>>>()

  /**
   * What the host remembers about an element that its inline styles cannot say.
   *
   * Lynx expresses a style bag, visibility, and an animation's current frame
   * through one channel, and `__SetInlineStyles` overwrites wholesale — so a
   * style write would otherwise un-hide an element the runtime had hidden.
   * Remembering the parts separately lets a style write re-assert the hidden
   * state, lets showing an element again restore the display its own style asked
   * for, and lets an animation put the element back exactly as it found it.
   */
  const state = new WeakMap<LynxElement, LynxElementState>()

  const stateOf = (element: LynxElement): LynxElementState => {
    const existing = state.get(element)
    if (existing) return existing
    const created: LynxElementState = { style: null, styleDisplay: null, hidden: false }
    state.set(element, created)
    return created
  }

  /**
   * Applies an element's own style bag, which is both what `setStyle` does and
   * what an animation does when it releases the element at the end.
   *
   * Named rather than inlined precisely so the animator can reach it: "put this
   * element back the way its style prop says it should be" is one operation, and
   * having two spellings of it is how the visibility invariant would come to be
   * honoured in one of them and not the other.
   */
  const applyOwnStyle = (element: LynxElement, value: StyleValue | null): void => {
    const current = stateOf(element)
    current.style = value
    // Passing an empty bag is how a style is cleared: it replaces whatever
    // was set before, since `__SetInlineStyles` overwrites wholesale.
    const styles = value === null ? {} : toStyleStrings(value)
    current.styleDisplay = styles['display'] ?? null
    api.__SetInlineStyles(element, styles)
    // That wholesale replacement is exactly what would un-hide a hidden
    // element, so the runtime's visibility is put back on top of it.
    if (current.hidden) api.__AddInlineStyle(element, 'display', 'none')
  }

  return {
    platform: 'lynx',

    // Spread rather than assigned, because `exactOptionalPropertyTypes` draws a
    // real distinction here: a host that omits a field and one that sets it to
    // `undefined` should not be the same host, and only the first is "this
    // target did not say".
    ...(options.environment === undefined ? {} : { environment: options.environment }),
    ...(options.focus === undefined ? {} : { focus: options.focus }),
    ...(options.blur === undefined ? {} : { blur: options.blur }),

    // A framework-owned tree does not participate in Lynx's own component
    // system, so every element is created under component ID 0.
    createElement: (tag) => toHostElement(api.__CreateElement(tag, 0, {})),

    // A native container view is the idiomatic wrapper for a swapped subtree,
    // so unlike the web there is no layout trick needed here — the wrapper is
    // simply part of the view hierarchy, which is how native trees are built.
    createFlowHost: () => {
      const wrapper = api.__CreateElement('view', 0, {})
      // Nobody wrote this element, so it must not appear in the accessibility
      // tree between a `role="list"` and its items. Being an ordinary container
      // view is exactly why that would otherwise happen here. See the invariant
      // on `Host.createFlowHost`.
      api.__SetAttribute(wrapper, 'accessibility-element', false)
      return toHostElement(wrapper)
    },

    // Text in Lynx lives in a `raw-text` element carrying a `text` attribute,
    // nested inside a `<text>` element that provides the styling.
    createText: (value) => {
      const node = api.__CreateElement('raw-text', 0, {})
      api.__SetAttribute(node, 'text', value)
      return toHostText(node)
    },

    setText: (node, value) => api.__SetAttribute(fromHostText(node), 'text', value),

    setProperty: (target, name, value) => {
      const element = fromHostElement(target)
      // Classes have their own PAPI call and are not attributes, so `class`
      // has to be routed rather than passed through.
      if (name === 'class') {
        api.__SetClasses(element, typeof value === 'string' ? value : '')
        return
      }
      // `false` clears an attribute for nearly everything, and for the tri-state
      // props it is the value itself — see TRI_STATE_PROPS. Collapsing the two
      // would drop a stated opt-out on this target while the DOM host kept it.
      const unset = TRI_STATE_PROPS.has(name) ? isAbsent(value) : value === false || isAbsent(value)
      api.__SetAttribute(element, ATTRIBUTES[name] ?? name, unset ? null : value)
    },

    getProperty: (target, name) => api.__GetAttributes(fromHostElement(target))[ATTRIBUTES[name] ?? name],

    setStyle: (target, value) => applyOwnStyle(fromHostElement(target), value),

    setVisible: (target, visible) => {
      const element = fromHostElement(target)
      const current = stateOf(element)
      current.hidden = !visible
      // Showing an element restores what its own style bag asked for. Lynx lays
      // elements out with flex by default, so a bag that said nothing about
      // display gets `flex` back rather than the property being cleared.
      api.__AddInlineStyle(element, 'display', visible ? (current.styleDisplay ?? DEFAULT_DISPLAY) : 'none')
    },

    // The engine's own animation APIs are not in the Element PAPI, so this is
    // built from inline transitions — the most the declared contract can express
    // — and an app whose engine version has something better supplies it through
    // `options.animate`. See `lynx-transition-animator.ts` for what that costs.
    animate:
      options.animate ?? createTransitionAnimator(api, (element) => applyOwnStyle(element, stateOf(element).style)),

    addEventListener: (target, name, handler) => {
      const element = fromHostElement(target)
      const byName = handlers.get(element) ?? new Map<string, Set<HostEventHandler>>()
      handlers.set(element, byName)

      // Most vocabulary events are one engine event; `pointer` is four, because
      // a gesture is a sequence and one handler for all its phases is what
      // makes a recogniser writable without reassembling the stream.
      const engineNames = EVENT_GROUPS[name] ?? [name]

      const existing = byName.get(name)
      if (existing) {
        existing.add(handler)
      } else {
        const set = new Set<HostEventHandler>([handler])
        byName.set(name, set)
        for (const engineName of engineNames) {
          // Iterate a copy so a handler detaching itself cannot disturb the walk.
          api.__AddEvent(element, 'bindEvent', engineName, (event) => {
            const native = toNativeEvent(name, event, engineName)
            for (const listener of [...set]) listener(native)
          })
        }
      }

      return () => {
        const set = byName.get(name)
        if (!set) return
        set.delete(handler)
        // Drop the dispatcher once nothing is listening, so the engine is not
        // left calling into an empty set for every gesture.
        if (set.size === 0) {
          byName.delete(name)
          for (const engineName of engineNames) api.__AddEvent(element, 'bindEvent', engineName, null)
        }
      }
    },

    insert: (parent, node, anchor) => {
      const parentElement = fromHostElement(parent)
      const child = fromHostNode(node)
      // Detach first so an insert doubles as a move, which is what the list
      // reconciler relies on when rows change position.
      const currentParent = api.__GetParent(child)
      if (currentParent) api.__RemoveElement(currentParent, child)

      if (anchor === null) api.__AppendElement(parentElement, child)
      else api.__InsertElementBefore(parentElement, child, fromHostNode(anchor))
    },

    remove: (node) => {
      const child = fromHostNode(node)
      const parent = api.__GetParent(child)
      if (parent) api.__RemoveElement(parent, child)
    },

    clear: (target) => {
      const element = fromHostElement(target)
      for (const child of api.__GetChildren(element)) api.__RemoveElement(element, child)
    },

    firstChild: (target) => {
      const first = api.__FirstElement(fromHostElement(target))
      return first === null ? null : toHostNode(first)
    },

    nextSibling: (node) => {
      const next = api.__NextElement(fromHostNode(node))
      return next === null ? null : toHostNode(next)
    },

    flush: () => api.__FlushElementTree(),
  }
}

/**
 * Wraps an element the engine already owns — typically the page — as a mount
 * target, so an app can attach to it without the runtime seeing a Lynx type.
 */
/**
 * What the engine can do that its Element PAPI does not cover.
 *
 * Every field is optional and the whole object may be omitted, so the ordinary
 * `createLynxHost()` on a device is unchanged. Supplying one is how an app
 * teaches this adapter about the parts of its own engine version that the PAPI
 * subset cannot reach — see the note on {@link createLynxHost} for why they are
 * asked for rather than guessed at.
 */
export type LynxHostOptions = {
  /** Colour scheme, dimensions, safe-area insets, and the motion preference, as signals. */
  environment?: HostEnvironment
  /** Moves keyboard focus to an element. */
  focus?: (element: HostElement) => void
  /** Takes keyboard focus away from an element. */
  blur?: (element: HostElement) => void
  /**
   * Runs a timeline, replacing the transition-based default.
   *
   * The only option here that is an UPGRADE rather than a capability the adapter
   * lacks entirely. Inline transitions genuinely animate, and the engine
   * genuinely owns the interpolation, but the sequencing between keyframes and
   * between repeats is a JavaScript timer — so an engine build with a real
   * animation API should be handed here, where it will be frame-exact.
   */
  animate?: Host['animate']
}

export const lynxRoot = (element: LynxElement): HostElement => toHostElement(element)

/** What the host remembers per element, since one inline-style channel serves three features. */
type LynxElementState = {
  /** The bag the element's own `style` prop last asked for, so an animation can put it back. */
  style: StyleValue | null
  /** The `display` that bag asked for, or `null` when it asked for none. */
  styleDisplay: string | null
  /** Whether the runtime has hidden this element through `setVisible`. */
  hidden: boolean
}

/** What an element lays out as when nothing has said otherwise. Lynx is flex everywhere. */
const DEFAULT_DISPLAY = 'flex'

/**
 * Vocabulary prop names Lynx spells differently.
 *
 * `testId` is the interesting one: passed through raw it is an attribute the
 * engine does not recognise, so a UI test would have nothing to select on. The
 * DOM host already emits `data-testid`, and matching it here means one selector
 * finds the element in the browser preview and on the device alike.
 *
 * The accessibility entries follow Lynx's `accessibility-*` attribute
 * convention. Unlike the DOM host there is no element to choose — a native tree
 * has one container view and the role is an attribute on it — so this stays a
 * flat rename rather than the two-spellings-per-prop arrangement the web needs.
 *
 * This table is the part of the host most likely to need adjusting for a given
 * engine version, and it is deliberately the cheapest thing to adjust: the
 * mapping is asserted in `create-lynx-host.test.tsx` against a fake engine, so
 * correcting an attribute name is a one-line edit with a test that says whether
 * it took.
 */
/**
 * Vocabulary events that need several engine listeners rather than one.
 *
 * Hover is deliberately absent, and its absence is the feature: a device has no
 * hover, so `onHoverIn` never fires here. A hover-only affordance is a design
 * bug rather than a platform difference to smooth over, and synthesising one
 * from a touch would hide it until somebody used the app.
 */
const EVENT_GROUPS: Record<string, readonly string[]> = {
  pointer: ['touchstart', 'touchmove', 'touchend', 'touchcancel'],
}

/** Which phase each of those engine events reports. */
const POINTER_PHASES: Record<string, 'down' | 'move' | 'up' | 'cancel'> = {
  touchstart: 'down',
  touchmove: 'move',
  touchend: 'up',
  touchcancel: 'cancel',
}

const ATTRIBUTES: Record<string, string> = {
  testId: 'data-testid',
  axis: 'scroll-orientation',
  secure: 'secure-input',
  submitLabel: 'confirm-type',
  autoComplete: 'autofill-hint',
  selectable: 'text-selection',
  role: 'accessibility-role',
  level: 'accessibility-level',
  label: 'accessibility-label',
  hint: 'accessibility-hint',
  focusable: 'focusable',
  disabled: 'accessibility-disabled',
  selected: 'accessibility-selected',
  checked: 'accessibility-checked',
  expanded: 'accessibility-expanded',
}

/**
 * Turns a Lynx event into the shape the vocabulary promises.
 *
 * The engine reports a gesture's position under `detail`, and a scroll offset
 * under `scrollLeft` / `scrollTop` — different words for the same two numbers
 * the DOM host reads off a `MouseEvent` and an element. Reconciling that here is
 * the entire reason `onScroll={(event) => event.y}` means one thing on both
 * targets.
 *
 * Anything the vocabulary does not name passes through untouched: its meaning
 * belongs to whoever attached the listener, and this host has no standing to
 * reshape it.
 *
 * Like {@link ATTRIBUTES}, the field names read from the engine are the part
 * most likely to need adjusting per engine version, and are asserted against the
 * fake engine for exactly that reason.
 */
const toNativeEvent = (name: string, event: unknown, engineName: string = name): unknown => {
  const source = (event ?? {}) as Record<string, unknown>

  if (name === 'pointer') {
    // The engine reports a touch under `detail`, or as a `touches` list when
    // more than one finger is down. Reading both is the same defensiveness the
    // rest of this function applies: these field names are the part most likely
    // to differ per engine version, which is why the fake engine asserts them.
    const detail = (source['detail'] ?? source) as Record<string, unknown>
    const touches = source['touches']
    const touch = (Array.isArray(touches) && touches.length > 0 ? touches[0] : detail) as Record<string, unknown>
    return {
      id: numberOr(touch['identifier']) ?? numberOr(touch['id']) ?? 0,
      x: numberOr(touch['x']) ?? 0,
      y: numberOr(touch['y']) ?? 0,
      phase: POINTER_PHASES[engineName] ?? 'move',
      raw: event,
    }
  }

  if (name === 'tap' || name === 'longpress') {
    const detail = (source['detail'] ?? source) as Record<string, unknown>
    const x = numberOr(detail['x'])
    const y = numberOr(detail['y'])
    // A gesture with no position is a real case here too — an accessibility
    // action can activate an element without touching it — so the absence is
    // reported rather than being flattened to the top-left corner.
    return x === null || y === null ? { raw: event } : { x, y, raw: event }
  }

  if (name === 'scroll') {
    return { x: numberOr(source['scrollLeft']) ?? 0, y: numberOr(source['scrollTop']) ?? 0, raw: event }
  }

  if (name === 'input' || name === 'change' || name === 'submit') {
    const detail = (source['detail'] ?? source) as Record<string, unknown>
    return { value: String(detail['value'] ?? ''), raw: event }
  }

  if (NAMED_EVENTS_WITHOUT_DATA.has(name)) return { raw: event }
  return event
}

/** Reads a numeric field, treating anything that is not a finite number as missing. */
const numberOr = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/**
 * Stringifies a style bag and drops the entries that mean "unset".
 *
 * Numbers become density-independent pixels here rather than being handed over
 * bare, which is the host's job per the contract — see {@link toStyleText} for
 * the properties that stay unitless.
 */
const toStyleStrings = (value: StyleValue): Record<string, string> => {
  const styles: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || entry === undefined || entry === false) continue
    styles[key] = toStyleText(key, entry)
  }
  return styles
}

/*
 * Host nodes are opaque to the runtime, so the adapter crosses that boundary
 * with a cast. Confining the casts here keeps everything above typed against
 * the real Lynx element type.
 */
const toHostElement = (node: LynxElement): HostElement => node as unknown as HostElement
const toHostText = (node: LynxElement): HostText => node as unknown as HostText
const toHostNode = (node: LynxElement): HostNode => node as unknown as HostNode
const fromHostElement = (node: HostElement): LynxElement => node as unknown as LynxElement
const fromHostText = (node: HostText): LynxElement => node as unknown as LynxElement
const fromHostNode = (node: HostNode): LynxElement => node as unknown as LynxElement
