import type { Host } from '../host'
import type { HostElement, HostNode, HostText } from '../types'
import { createDomEnvironment } from './dom-environment'
import { installDomReset, RESET_CONTAINER_MARKER, RESET_MARKER } from './dom-reset'
import { NAMED_EVENTS_WITHOUT_DATA } from './named-events'
import { toStyleText } from './to-style-text'

/**
 * A host that renders the element vocabulary into the DOM.
 *
 * Note which direction this adapter runs: the browser is the GUEST here. The
 * vocabulary is the native one, and this host maps it onto the nearest HTML
 * equivalent so a native component tree can be developed and previewed in a
 * browser — fast reload, real devtools — and then run unchanged on a device.
 * That is the opposite of treating the DOM as the real target and native as an
 * approximation of it, and it is why nothing above this file mentions HTML.
 *
 * Mutations apply immediately, so there is no `flush` and the scheduler skips
 * the commit step entirely.
 *
 * @param options.reset Whether to install the layout reset that makes a browser
 *   behave like Yoga. On by default, because without it an unstyled container
 *   with two children stacks vertically on a device and horizontally here —
 *   which is write-once being a slogan rather than a fact. Turn it off when
 *   this runtime is a guest in a page whose styling you do not own, and read
 *   `dom-reset.ts` for exactly what you are then responsible for.
 */
export const createDomHost = ({ reset = true }: DomHostOptions = {}): Host => {
  if (reset) installDomReset()

  /**
   * The host's own style layer, kept per element.
   *
   * Three separate things want to write inline styles here — the user's `style`
   * bag, `setVisible`, and the props that only exist as styles on the web
   * (`fit`, `lines`, `direction`) — and `setStyle` replaces the inline style
   * wholesale, so the last two would be erased by any style write. The fix is to
   * remember what the host itself asked for and re-assert it afterwards.
   *
   * A genuinely separate channel is possible on the web — a stylesheet plus a
   * generated class per element — but that buys a document-level singleton and a
   * class-name allocator for a preview host, which is a lot of machinery for the
   * same guarantee. Layering through one WeakMap keeps the host self-contained
   * and leaves the element carrying exactly the styles it appears to carry.
   */
  const layers = new WeakMap<HTMLElement, DomStyleLayer>()

  const layerOf = (element: HTMLElement): DomStyleLayer => {
    const existing = layers.get(element)
    if (existing) return existing
    const created: DomStyleLayer = { owned: new Map(), styleDisplay: null, hidden: false }
    layers.set(element, created)
    return created
  }

  /**
   * Resolves the one `display` three features are competing for.
   *
   * Hiding always wins, because `setVisible` owns visibility outright. After
   * that a host-owned display wins, since the props that set one (a line clamp,
   * the flow wrapper) simply do not work without it. Only then does the user's
   * own style bag get a say, and an empty string means "whatever this element
   * displays as naturally".
   */
  const applyDisplay = (element: HTMLElement, layer: DomStyleLayer): void => {
    element.style.display = layer.hidden ? 'none' : (layer.owned.get('display') ?? layer.styleDisplay ?? '')
  }

  /** Re-asserts the host's layer over whatever the style bag just wrote. */
  const applyLayer = (element: HTMLElement, layer: DomStyleLayer): void => {
    for (const [property, value] of layer.owned) element.style.setProperty(property, value)
    applyDisplay(element, layer)
  }

  /** Adds or drops one host-owned declaration, pushing the result to the element. */
  const own = (element: HTMLElement, property: string, value: string | null): void => {
    const layer = layerOf(element)
    if (value === null) {
      layer.owned.delete(property)
      element.style.removeProperty(property)
    } else {
      layer.owned.set(property, value)
      element.style.setProperty(property, value)
    }
    applyDisplay(element, layer)
  }

  /**
   * Handles the vocabulary props that are structure or layout on the web rather
   * than attributes, and reports whether it took the prop.
   *
   * Without this they reach the element as literal attributes — `<img
   * fit="cover">`, `<span lines="2">` — which the browser ignores, so the
   * preview quietly stops matching the device. They go through the host's own
   * style layer so a `style` prop on the same element cannot wipe them.
   */
  const applyLayoutProp = (element: HTMLElement, name: string, value: unknown): boolean => {
    const unset = value === false || value === null || value === undefined

    // `multiline` decided which element to build back in `createElement`, and a
    // node cannot change what it is, so there is nothing left to do — but it
    // must still be swallowed or it renders as a junk `multiline=""` attribute.
    if (name === 'multiline') return true

    if (name === 'fit') {
      own(element, 'object-fit', unset ? null : String(value))
      return true
    }

    if (name === 'lines') {
      // The line clamp is still only reachable through the `-webkit-` prefixed
      // properties, and it needs all four of them together: the clamp itself
      // does nothing without the box display, the vertical orientation, and the
      // overflow that hides the trimmed text.
      own(element, 'display', unset ? null : '-webkit-box')
      own(element, '-webkit-box-orient', unset ? null : 'vertical')
      own(element, 'overflow', unset ? null : 'hidden')
      own(element, '-webkit-line-clamp', unset ? null : String(value))
      return true
    }

    if (name === 'axis') {
      // A native scroll container scrolls one axis and pins the other, so both
      // are set rather than leaving the cross axis to spill. Anything that is
      // not an explicit `horizontal` — including no prop at all — is vertical,
      // which is the vocabulary's default.
      const horizontal = value === 'horizontal'
      own(element, 'overflow-x', horizontal ? 'auto' : 'hidden')
      own(element, 'overflow-y', horizontal ? 'hidden' : 'auto')
      return true
    }

    if (name === 'selectable') {
      // `false` is the whole point of the prop, so it cannot mean "unset it" the
      // way the contract's general rule would have it — only an absent value
      // means "leave the target's default alone". Same trap as `focusable`.
      const selection = value === null || value === undefined ? null : value ? 'text' : 'none'
      // Both spellings, because the unprefixed property is still not enough on
      // WebKit — and a preview that can be selected where the device cannot is
      // the divergence this prop exists to remove.
      own(element, 'user-select', selection)
      own(element, '-webkit-user-select', selection)
      return true
    }

    return false
  }

  /**
   * Applies one accessibility prop, and reports whether it took it.
   *
   * Most of these have two spellings on the web and the right one depends on
   * what was actually built: `disabled` is a real attribute on a `<button>` and
   * `aria-disabled` on anything else, `label` is `alt` on an `<img>` and
   * `aria-label` elsewhere. Picking per element is the point — the native prop
   * says what the element IS, and how that is spelled is the host's problem.
   */
  const applyAccessibilityProp = (element: HTMLElement, name: string, value: unknown): boolean => {
    const unset = value === false || value === null || value === undefined

    if (name === 'role') {
      // `role` already chose the element back in `createElement`. Most roles are
      // therefore implicit in the tag and emitting the attribute as well would
      // be noise, so only the two that build a generic element carry one.
      if (value === 'none') attribute(element, 'aria-hidden', unset ? null : 'true')
      else attribute(element, 'role', typeof value === 'string' && GENERIC_ROLES.has(value) ? value : null)
      return true
    }

    // The heading element carries its own depth, so `aria-level` would only
    // repeat what `<h2>` already says. Swallowed rather than emitted.
    if (name === 'level') return true

    if (name === 'label') {
      // An `<img>` spells its accessible name `alt`, and an empty `alt` is
      // meaningfully different from a missing one — it marks the image as
      // decorative — so the attribute is left in place rather than removed.
      if (element.tagName === 'IMG') attribute(element, 'alt', unset ? '' : String(value))
      else attribute(element, 'aria-label', unset ? null : String(value))
      return true
    }

    if (name === 'hint') {
      attribute(element, 'aria-description', unset ? null : String(value))
      return true
    }

    // The tri-state props below deliberately break the contract's general rule
    // that `false` means "unset it", because for these three `false` and absent
    // are different facts rather than the same one. `aria-expanded="false"` is a
    // collapsed disclosure; no attribute at all is something that does not
    // expand. Collapsing the two would announce the wrong thing, so `false` is
    // written out and only `null`/`undefined` remove.
    const absent = value === null || value === undefined

    if (name === 'focusable') {
      // `-1` rather than removal, because an element that asked NOT to be
      // focusable may still be natively focusable — a `<button>` being the
      // obvious case — and only an explicit `-1` takes it back out of the tab
      // order. Removing the attribute would leave the prop apparently doing
      // nothing.
      attribute(element, 'tabindex', absent ? null : value === true ? '0' : '-1')
      return true
    }

    if (name === 'disabled') {
      // Genuinely binary, unlike the three below: a real `disabled` attribute is
      // present or it is not, so this one does follow the usual convention.
      if (SUPPORTS_DISABLED.has(element.tagName)) attribute(element, 'disabled', unset ? null : '')
      else attribute(element, 'aria-disabled', unset ? null : 'true')
      return true
    }

    if (name === 'checked' && 'checked' in element) {
      // Through the property, not the attribute, so `getProperty` reads back
      // what the user actually did rather than the initial value — the same
      // reason `value` is handled that way below.
      ;(element as HTMLInputElement).checked = value === true
      return true
    }

    if (name === 'selected' || name === 'checked' || name === 'expanded') {
      attribute(element, `aria-${name}`, absent ? null : String(value === true))
      return true
    }

    if (name === 'href') {
      // Only an anchor can be navigated to. Anywhere else this would render as
      // an attribute the browser ignores, which is the preview quietly stopping
      // matching the device.
      if (element.tagName === 'A') attribute(element, 'href', unset ? null : String(value))
      return true
    }

    return false
  }

  /**
   * What each input wants its `type` to be, from the two props that both land
   * there.
   *
   * `keyboard` and `secure` are one setting on the web and two everywhere else,
   * so they collide over a single attribute here — the same shape of problem as
   * `style` and `show` fighting over `display`, and it fails the same way:
   * whichever prop was written last would win, making behaviour depend on JSX
   * attribute order. Remembering both and resolving them is the fix.
   */
  const inputTypes = new WeakMap<HTMLElement, InputTypeLayer>()

  /** Applies `type` from whichever of the two props last changed. */
  const applyInputType = (element: HTMLElement, change: Partial<InputTypeLayer>): void => {
    const layer = inputTypes.get(element) ?? { keyboard: null, secure: false }
    Object.assign(layer, change)
    inputTypes.set(element, layer)
    // A textarea has no `type` at all, so a multiline input simply has neither
    // a keyboard mode nor a mask rather than growing an attribute nothing reads.
    if (element.tagName === 'TEXTAREA') return
    // Masking wins: a secure field that raised the right keyboard but showed the
    // characters would be a far worse failure than the reverse.
    element.setAttribute('type', layer.secure ? 'password' : (INPUT_TYPES[layer.keyboard ?? ''] ?? 'text'))
  }

  return {
    platform: 'web',

    environment: createDomEnvironment(),

    focus: (element) => {
      // `preventScroll` is deliberately NOT passed. Scrolling a focused element
      // into view is the browser doing the right thing, and it is what a native
      // target does too, so suppressing it here would be the DOM host inventing
      // a difference rather than removing one.
      fromHostElement(element).focus()
    },

    blur: (element) => {
      fromHostElement(element).blur()
    },

    createElement: (tag, props) => {
      const element = document.createElement(htmlTag(tag, props))
      if (reset) {
        element.setAttribute(RESET_MARKER, '')
        // Everything except a text run is a container, and a container is where
        // text inheritance stops — the rule Yoga follows and CSS does not.
        if (tag !== 'text') element.setAttribute(RESET_CONTAINER_MARKER, '')
      }
      // A `scroll-view` scrolls whether or not anyone wrote a `direction`, so it
      // is created as though the prop were already set to its default. A later
      // `direction` write simply replaces these.
      if (tag === 'scroll-view') applyLayoutProp(element, 'axis', undefined)
      // A bare `<button>` defaults to `type="submit"`, so the same component
      // that behaves correctly on its own would submit the form the moment
      // someone nested it in one — and native targets have no such concept for
      // the behaviour to have come from. Stating the type keeps a button a
      // button wherever it lands.
      if (element.tagName === 'BUTTON') element.setAttribute('type', 'button')
      return toHostElement(element)
    },

    createFlowHost: () => {
      // `display: contents` makes the wrapper vanish from layout, so the branch
      // inside participates in the parent's flex or grid flow as though the
      // wrapper were not there. Native hosts need no such trick — a container
      // view is a perfectly ordinary thing to nest there. It goes through the
      // host's layer so a style write on the wrapper cannot bring it back into
      // layout.
      const wrapper = document.createElement('div')
      own(wrapper, 'display', 'contents')
      // Vanishing from LAYOUT is not vanishing from the accessibility tree, and
      // the two are easy to conflate. Nobody wrote this element, so it must not
      // interpose between a `role="list"` and its items — and `display: contents`
      // has never been consistent enough across browsers to rely on for that.
      // See the invariant on `Host.createFlowHost`.
      wrapper.setAttribute('role', 'presentation')
      return toHostElement(wrapper)
    },

    createText: (value) => toHostText(document.createTextNode(value)),

    setText: (node, value) => {
      fromHostText(node).data = value
    },

    setProperty: (target, name, value) => {
      const element = fromHostElement(target)
      if (applyAccessibilityProp(element, name, value)) return
      if (applyLayoutProp(element, name, value)) return

      const attribute = ATTRIBUTES[name] ?? name

      // `value` has to go through the property rather than the attribute: the
      // attribute only seeds the initial value, so writing it would leave the
      // field showing whatever the user last typed.
      if (attribute === 'value' && 'value' in element) {
        ;(element as HTMLInputElement).value = value === null || value === undefined ? '' : String(value)
        return
      }

      if (name === 'keyboard') {
        applyInputType(element, { keyboard: typeof value === 'string' ? value : null })
        return
      }

      if (name === 'secure') {
        applyInputType(element, { secure: value === true })
        return
      }

      if (name === 'autoComplete' && typeof value === 'string') {
        element.setAttribute(attribute, AUTOCOMPLETE_VALUES[value] ?? value)
        return
      }

      if (value === false || value === null || value === undefined) element.removeAttribute(attribute)
      else element.setAttribute(attribute, value === true ? '' : String(value))
    },

    getProperty: (target, name) => {
      const element = fromHostElement(target)
      if (name === 'value' && 'value' in element) return (element as HTMLInputElement).value
      if (name === 'checked' && 'checked' in element) return (element as HTMLInputElement).checked
      return element.getAttribute(ATTRIBUTES[name] ?? name)
    },

    setStyle: (target, value) => {
      const element = fromHostElement(target)
      const layer = layerOf(element)
      // Clearing the attribute rather than the declarations keeps an element
      // whose style bag emptied out from carrying a stray `style=""`.
      element.removeAttribute('style')
      layer.styleDisplay = null
      if (value !== null) {
        for (const [key, entry] of Object.entries(value)) {
          if (entry === null || entry === undefined || entry === false) continue
          const property = cssName(key)
          const text = toStyleText(key, entry)
          // Remembered rather than merely written, because `setVisible` has to
          // know what to put back when it shows the element again.
          if (property === 'display') layer.styleDisplay = text
          element.style.setProperty(property, text)
        }
      }
      applyLayer(element, layer)
    },

    setVisible: (target, visible) => {
      const element = fromHostElement(target)
      const layer = layerOf(element)
      layer.hidden = !visible
      applyDisplay(element, layer)
    },

    addEventListener: (target, name, handler) => {
      const element = fromHostElement(target)
      const domName = EVENTS[name] ?? name
      // The listener is wrapped rather than passed straight through, because the
      // handler is owed the framework's payload shape and not the browser's.
      // The wrapper is what `removeEventListener` has to be given back, hence
      // the local binding.
      const listener = (event: Event): void => {
        // `submit` rides on `keydown`, so most of what arrives is not a
        // submission at all and has to be dropped before the handler sees it.
        if (name === 'submit' && !isSubmit(event, element)) return
        handler(toNativeEvent(name, event, element))
      }
      element.addEventListener(domName, listener)
      return () => element.removeEventListener(domName, listener)
    },

    insert: (parent, node, anchor) => {
      fromHostElement(parent).insertBefore(fromHostNode(node), anchor === null ? null : fromHostNode(anchor))
    },

    remove: (node) => fromHostNode(node).remove(),

    clear: (target) => fromHostElement(target).replaceChildren(),

    firstChild: (target) => {
      const first = fromHostElement(target).firstChild
      return first === null ? null : toHostNode(first)
    },

    nextSibling: (node) => {
      const next = fromHostNode(node).nextSibling
      return next === null ? null : toHostNode(next)
    },
  }
}

/**
 * Wraps an existing DOM element as a mount target, so an app can be attached to
 * a real container without the runtime ever exposing a DOM type.
 *
 * @example
 * ```ts
 * setHost(createDomHost())
 * mount(domRoot(document.body), App)
 * ```
 */
/** Options for {@link createDomHost}. */
export type DomHostOptions = {
  /** Install the Yoga-shaped layout reset. Defaults to `true`; see {@link createDomHost}. */
  reset?: boolean
}

export const domRoot = (element: Element): HostElement => toHostElement(element)

/**
 * What the DOM host remembers about an element that the element itself cannot
 * tell it, because the inline style is a single slot several features write to.
 */
type DomStyleLayer = {
  /** Declarations the host owns, keyed by CSS property, re-applied after every style write. */
  readonly owned: Map<string, string>
  /** The `display` the element's own style bag asked for, or `null` when it asked for none. */
  styleDisplay: string | null
  /** Whether the runtime has hidden this element through `setVisible`. */
  hidden: boolean
}

/**
 * Picks the HTML element to build.
 *
 * Two props are read here rather than applied afterwards, because both decide
 * what the node IS and the DOM offers no way to change that once it exists —
 * there is no turning an `<input>` into a `<textarea>`, or a `<div>` into a
 * `<button>`. That makes them STATIC: a getter would have to rebuild the element
 * to take effect, so rather than half-honouring one, a function value is treated
 * as "not supported here" and the plain form is the supported one. `applyProp`
 * warns about the getter separately, so the mistake is not silent.
 *
 * Building the real element rather than a `<div>` with an ARIA role is the whole
 * point: a `<button>` arrives with focus order, Enter and Space activation, and
 * form submission already correct, and none of the three has to be
 * re-synthesised from keydown handlers that would be subtly wrong.
 */
const htmlTag = (tag: string, props?: Readonly<Record<string, unknown>>): string => {
  const multiline = props?.['multiline']
  if (tag === 'input' && typeof multiline !== 'function' && Boolean(multiline)) return 'textarea'

  const role = props?.['role']
  if (typeof role === 'string') {
    if (role === 'heading') return `h${headingLevel(props?.['level'])}`
    const roleTag = ROLE_TAGS[role]
    if (roleTag !== undefined) return roleTag
  }

  return HTML_TAGS[tag] ?? 'div'
}

/**
 * Clamps a heading depth to one that exists.
 *
 * Defaulting to 2 rather than 1 is deliberate: a page's single `<h1>` should be
 * something an author chose, not something they got by leaving a prop off.
 */
const headingLevel = (level: unknown): number =>
  typeof level === 'number' && level >= 1 && level <= 6 ? Math.trunc(level) : 2

/**
 * Roles that build a real element, and the element each builds.
 *
 * `heading` is absent because its element depends on `level`, and `list` and
 * `listitem` are absent on purpose — see {@link GENERIC_ROLES}.
 */
const ROLE_TAGS: Record<string, string> = {
  button: 'button',
  link: 'a',
  banner: 'header',
  navigation: 'nav',
  main: 'main',
  contentinfo: 'footer',
}

/**
 * Roles that stay a generic element carrying the ARIA role instead.
 *
 * `<ul>` accepts only `<li>`, and that is a parse-level content model rather
 * than a convention — the browser reshapes the tree and no attribute rescues it.
 * The control-flow components put a wrapper between a list and its items, so a
 * real `<ul>` would be invalid on the most ordinary list anyone would write. An
 * ARIA role has no content model, so a presentational wrapper in between is
 * survivable. See the invariant on `Host.createFlowHost`.
 */
const GENERIC_ROLES = new Set(['list', 'listitem'])

/** Elements with a real `disabled` attribute, which beats `aria-disabled` where it exists. */
const SUPPORTS_DISABLED = new Set(['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'])

/**
 * Turns a DOM event into the shape the vocabulary promises.
 *
 * Only the events the framework names are reshaped. Anything else — the
 * composition events the two-way input binding listens for, or whatever an app
 * attached through `ref` — is handed over untouched, because its meaning belongs
 * to whoever asked for it rather than to this package.
 */
const toNativeEvent = (name: string, event: Event, element: HTMLElement): unknown => {
  if (name === 'tap' || name === 'longpress') {
    const point = pointIn(event, element)
    return point === null ? { raw: event } : { x: point.x, y: point.y, raw: event }
  }

  if (name === 'scroll') {
    return { x: element.scrollLeft, y: element.scrollTop, raw: event }
  }

  if (name === 'input' || name === 'change' || name === 'submit') {
    return { value: 'value' in element ? String((element as HTMLInputElement).value) : '', raw: event }
  }

  if (NAMED_EVENTS_WITHOUT_DATA.has(name)) return { raw: event }
  return event
}

/**
 * Whether a keydown is the user confirming the field.
 *
 * Three things have to be true, and the last two are where this is usually got
 * wrong. It has to be Enter. It must not be Enter inside a `<textarea>`, where
 * the key inserts a newline on every target — a multiline field has no confirm
 * key, which is why the vocabulary says `onSubmit` does not fire there. And it
 * must not be the Enter that CHOOSES an input-method candidate: typing Japanese
 * or Chinese ends nearly every word with an Enter that means "yes, that one",
 * and submitting the form on it is the classic bug in this feature. The browser
 * marks those with `isComposing`, which is the same signal the two-way input
 * binding already holds writes for.
 */
const isSubmit = (event: Event, element: HTMLElement): boolean => {
  if (element.tagName === 'TEXTAREA') return false
  if (!('key' in event)) return false
  const key = event as KeyboardEvent
  return key.key === 'Enter' && !key.isComposing
}

/**
 * Where in the element a pointer event landed, or `null` when it had no
 * position at all.
 *
 * Pressing Enter or Space on a focused `<button>` fires a real `click` whose
 * coordinates are zero — as does an activation from an assistive technology —
 * and `detail === 0` is how the browser distinguishes that from a click at the
 * element's top-left corner. Reporting the corner would put a ripple in the
 * wrong place for every keyboard user, so the absence is reported instead.
 *
 * The box is read per event rather than cached because layout moves and a stale
 * origin is worse than the read. That is affordable here precisely because taps
 * are rare; `scroll` never comes through this path.
 */
const pointIn = (event: Event, element: HTMLElement): { x: number; y: number } | null => {
  if (!isPointerish(event) || event.detail === 0) return null
  const box = element.getBoundingClientRect()
  return { x: event.clientX - box.left, y: event.clientY - box.top }
}

/** A DOM event carrying a viewport position and an activation count. */
const isPointerish = (event: Event): event is MouseEvent =>
  'clientX' in event && 'clientY' in event && 'detail' in event

/** Sets an attribute, or removes it when the value is `null`. */
const attribute = (element: HTMLElement, name: string, value: string | null): void => {
  if (value === null) element.removeAttribute(name)
  else element.setAttribute(name, value)
}

/**
 * How the element vocabulary lands in HTML. Anything unmapped becomes a `div`,
 * which is the harmless default — an unknown container renders as a container.
 *
 * `scroll-view` is a plain div here; the scrolling itself comes from the
 * `direction` prop, which maps to an overflow style in `applyLayoutProp`.
 */
const HTML_TAGS: Record<string, string> = {
  view: 'div',
  text: 'span',
  image: 'img',
  'scroll-view': 'div',
  input: 'input',
}

/** Vocabulary prop names that have a different spelling in HTML. */
const ATTRIBUTES: Record<string, string> = {
  testId: 'data-testid',
  // A real HTML attribute, which is the whole reason this prop needs no `form`
  // element: the browser raises the same soft-keyboard confirm key a device does.
  submitLabel: 'enterkeyhint',
  autoComplete: 'autocomplete',
}

/**
 * Autofill hints whose web spelling differs from the vocabulary's.
 *
 * One entry, for the same reason `keyboard="phone"` becomes `type="tel"`: the
 * vocabulary says `phone` everywhere so there is one word for one concept, and
 * translating it into the platform's word is the host's job.
 */
const AUTOCOMPLETE_VALUES: Record<string, string> = {
  phone: 'tel',
}

/**
 * Keyboard modes mapped onto the HTML input types that raise them.
 *
 * Most of the vocabulary happens to line up with a type name, but `phone` does
 * not: `type="phone"` is not a real input type, so the browser silently falls
 * back to plain text and the preview loses the numeric keypad the device shows.
 *
 * `password` is absent because it is not a keyboard mode — it is masking, which
 * the vocabulary spells `secure`. The web is the only target where the two are
 * the same attribute.
 */
const INPUT_TYPES: Record<string, string> = {
  text: 'text',
  number: 'number',
  email: 'email',
  phone: 'tel',
}

/** The two props competing for one input `type`. See `applyInputType`. */
type InputTypeLayer = {
  /** The keyboard mode last asked for, or `null` for the default. */
  keyboard: string | null
  /** Whether the field masks what is typed. */
  secure: boolean
}

/**
 * Native gesture names mapped onto the DOM events that stand in for them.
 * Anything unmapped passes through unchanged, which is what lets the composition
 * events the two-way input binding listens for reach the element directly.
 */
const EVENTS: Record<string, string> = {
  tap: 'click',
  longpress: 'contextmenu',
  // There is no `submit` on an input outside a `<form>`, and the vocabulary
  // deliberately has no form element — a device has a return key, not a form.
  // Enter on a keydown is the same gesture, filtered by `isSubmit`.
  submit: 'keydown',
}

/** Converts a camelCase style key to its CSS spelling, leaving custom properties alone. */
const cssName = (key: string): string =>
  key.startsWith('--') ? key : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

/*
 * Host nodes are opaque to the runtime, so the adapter crosses that boundary
 * with a cast. Confining the casts to these helpers keeps everything above
 * fully typed against real DOM types.
 */
const toHostElement = (node: Element): HostElement => node as unknown as HostElement
const toHostText = (node: Text): HostText => node as unknown as HostText
const toHostNode = (node: Node): HostNode => node as unknown as HostNode
const fromHostElement = (node: HostElement): HTMLElement => node as unknown as HTMLElement
const fromHostText = (node: HostText): Text => node as unknown as Text
const fromHostNode = (node: HostNode): ChildNode => node as unknown as ChildNode
