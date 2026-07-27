/**
 * The map from a DOM event to the payload a Lynx handler expects.
 *
 * The DOM PAPI next door can reproduce Lynx's element tree exactly, because a
 * tree is just structure. An event is not: `click` and `tap` carry the same
 * intent and nothing else in common, and a handler written against
 * `event.detail.x` reads `undefined` from a `MouseEvent`. So the payload is
 * synthesised — same field names, same nesting, same units — and app code goes
 * on reading exactly what it would read on a device.
 *
 * ## Two shapes, not one
 *
 * Most events nest their data under `detail`. `<image>`'s `load` and `error` do
 * not: their fields sit at the TOP LEVEL of the event object, which is a
 * genuine irregularity in Lynx rather than a mistake here, and one that only
 * bites you on a device if the preview smooths it over. It is reproduced.
 *
 * ## What a payload cannot have
 *
 * There is no `preventDefault`. Lynx does not have one — the documentation is
 * emphatic, even though `@lynx-js/types` still declares it — so a handler that
 * reached for it here would compile, work, and then do nothing on a phone.
 * `stopPropagation` IS real (a main-thread event has it) and is wired to the
 * DOM event's own.
 */

/**
 * How one Lynx event name is sourced from the DOM.
 *
 * `accepts` exists for the events that are a FILTER over a DOM event rather
 * than a rename: `confirm` is the Enter key and nothing else, so a plain
 * `keydown` binding would fire on every keystroke.
 */
type LynxEventBinding = {
  /** The DOM event to listen for. */
  readonly dom: string
  /** Whether this particular DOM event counts as the Lynx one. */
  readonly accepts?: (event: Event) => boolean
  /** The Lynx-shaped fields, merged over the common ones. */
  readonly payload: (event: Event, element: Element) => Record<string, unknown>
}

/**
 * A touch payload, from whichever pointer event stood in for it.
 *
 * Lynx reports three coordinate systems per touch — element-relative (`x`/`y`),
 * LynxView-relative (`pageX`/`pageY`) and window-relative (`clientX`/`clientY`)
 * — and `detail` carries the first finger's LynxView point. The browser only
 * has two of the three, so the LynxView pair is taken as the page pair: a
 * preview's LynxView IS the page.
 */
const touchPayload = (event: Event, element: Element): Record<string, unknown> => {
  const pointer = event as PointerEvent
  const box = element.getBoundingClientRect()
  const clientX = pointer.clientX ?? 0
  const clientY = pointer.clientY ?? 0
  const touch = {
    // A mouse has no pointer id in the Lynx sense; zero is a stable stand-in
    // for "the one finger", which is all a browser preview ever has.
    identifier: pointer.pointerId ?? 0,
    x: clientX - box.left,
    y: clientY - box.top,
    // Derived rather than read off the event, which is the browser's own
    // definition of a page coordinate — and it means a synthetic event that
    // only carries client coordinates still reports a sensible page point.
    pageX: clientX + window.scrollX,
    pageY: clientY + window.scrollY,
    clientX,
    clientY,
  }

  return {
    // A finger that has LEFT the screen is in `changedTouches` and not in
    // `touches`, which is the distinction a gesture recogniser reads to know a
    // stream ended.
    touches: event.type === 'pointerup' || event.type === 'pointercancel' ? [] : [touch],
    changedTouches: [touch],
    detail: { x: touch.pageX, y: touch.pageY },
  }
}

/** The `input` payload, including the flag that keeps an IME's candidates intact. */
const inputPayload = (event: Event): Record<string, unknown> => {
  const target = event.target as HTMLInputElement | null
  return {
    detail: {
      value: target?.value ?? '',
      selectionStart: target?.selectionStart ?? 0,
      selectionEnd: target?.selectionEnd ?? 0,
      // Lynx flags the intermediate candidates an IME emits, and `bindValue`
      // reads exactly this so it does not tear a composition apart. The browser
      // reports the same thing on the InputEvent, so this one is free.
      isComposing: (event as InputEvent).isComposing === true,
    },
  }
}

/** The payload `focus`, `blur` and `confirm` share: the control's current value. */
const valuePayload = (event: Event): Record<string, unknown> => {
  const target = event.target as HTMLInputElement | null
  return { detail: { value: target?.value ?? '' } }
}

/** Where each scroller was last time it reported, so a delta can be computed. */
const scrollOffsets = new WeakMap<Element, { top: number; left: number }>()

/**
 * The scroll payload, with the deltas Lynx reports and the DOM does not.
 *
 * A DOM scroll event carries only the resulting offsets, so the deltas are the
 * difference from the previous one — which is what `deltaX`/`deltaY` mean on a
 * device. The previous offsets live in a `WeakMap`, so a scroller that leaves
 * the tree takes its entry with it.
 */
const scrollPayload = (event: Event, element: Element): Record<string, unknown> => {
  const target = event.target instanceof Element ? event.target : element
  const previous = scrollOffsets.get(target) ?? { top: 0, left: 0 }
  const top = target.scrollTop
  const left = target.scrollLeft
  scrollOffsets.set(target, { top, left })

  return {
    detail: {
      scrollTop: top,
      scrollLeft: left,
      scrollHeight: target.scrollHeight,
      scrollWidth: target.scrollWidth,
      deltaX: left - previous.left,
      deltaY: top - previous.top,
    },
  }
}

/** The `detail` of a CustomEvent, as a plain bag. */
const detailOf = (event: Event): Record<string, unknown> => {
  const detail = (event as CustomEvent).detail
  return typeof detail === 'object' && detail !== null ? (detail as Record<string, unknown>) : {}
}

/**
 * Every Lynx event this preview knows how to source, and where it comes from.
 *
 * Deliberately short. An event that is not in here still binds — it is
 * registered under its own name, so a custom event dispatched at the element
 * arrives — it just gets the common payload and no synthesised fields. That is
 * the honest outcome: the preview reports what it actually knows.
 */
export const LYNX_EVENTS: Readonly<Record<string, LynxEventBinding>> = {
  // A tap is a click. `longpress` has no DOM event at all, and the context menu
  // is what a long press RAISES on a touch screen, so it is the closest thing
  // to a press-and-hold the browser will tell us about.
  tap: { dom: 'click', payload: touchPayload },
  longpress: { dom: 'contextmenu', payload: touchPayload },

  // Pointer events rather than touch events, so the preview responds to a mouse
  // as well as to a finger — a desktop browser is where this is actually looked
  // at, and a mouse fires no touch events at all.
  touchstart: { dom: 'pointerdown', payload: touchPayload },
  touchmove: { dom: 'pointermove', payload: touchPayload },
  touchend: { dom: 'pointerup', payload: touchPayload },
  touchcancel: { dom: 'pointercancel', payload: touchPayload },

  input: { dom: 'input', payload: inputPayload },
  focus: { dom: 'focus', payload: valuePayload },
  blur: { dom: 'blur', payload: valuePayload },
  // Lynx fires `confirm` when the keyboard's confirm button is pressed. On a
  // desktop that is Enter, so the binding is a keydown with a filter.
  confirm: {
    dom: 'keydown',
    accepts: (event) => (event as KeyboardEvent).key === 'Enter',
    payload: valuePayload,
  },

  scroll: { dom: 'scroll', payload: scrollPayload },

  // `<image>`'s load/error are the two events whose fields are top-level. They
  // arrive as CustomEvents the attribute table dispatches, because a custom
  // element showing an image through CSS fires no load of its own.
  load: { dom: 'load', payload: (event) => ({ ...detailOf(event) }) },
  error: {
    dom: 'error',
    payload: (event) => ({
      errMsg: 'image load failed',
      error_code: 0,
      lynx_categorized_code: 0,
      ...detailOf(event),
    }),
  },
}

/** Engine-assigned ids, handed out on first request and stable thereafter. */
const uniqueIds = new WeakMap<Element, number>()

/**
 * Where the numbering starts.
 *
 * Above zero for the same reason the package's fake engine starts there: zero
 * is out of range on a real engine, and code that treats it as "no element" is
 * a bug this preview must not be able to hide.
 */
let nextUniqueId = 10

/** The engine-assigned id an event reports as `target.uid`. */
export const elementUniqueId = (element: Element): number => {
  const existing = uniqueIds.get(element)
  if (existing !== undefined) return existing
  const id = nextUniqueId++
  uniqueIds.set(element, id)
  return id
}

/**
 * The `data-*` attributes, keyed the way Lynx keys them.
 *
 * Read off the attributes rather than from `element.dataset`, because the tags
 * this PAPI builds are unknown elements and `dataset` is only guaranteed on an
 * `HTMLElement` — the attributes are always there.
 */
const datasetOf = (element: Element): Record<string, unknown> => {
  const dataset: Record<string, unknown> = {}
  for (const attribute of element.attributes) {
    if (attribute.name.startsWith('data-')) dataset[attribute.name.slice('data-'.length)] = attribute.value
  }
  return dataset
}

/** The `Target` shape every Lynx event carries for `target` and `currentTarget`. */
const describe = (element: Element): Record<string, unknown> => ({
  id: element.id,
  uid: elementUniqueId(element),
  dataset: datasetOf(element),
})

/**
 * Builds the Lynx payload for one DOM event, or `null` when this DOM event is
 * not the Lynx one after all.
 *
 * `null` is how `confirm` declines every keystroke that is not Enter, and the
 * caller drops the event rather than delivering a payload nobody asked for.
 *
 * @param name The Lynx event name — `tap`, not `bindtap`.
 * @param element The element the listener was registered on, which becomes
 *   `currentTarget`. `target` comes from the DOM event, so a tap on a child
 *   reports the child, exactly as it would on a device.
 */
export const toLynxEvent = (name: string, event: Event, element: Element): Record<string, unknown> | null => {
  const binding = LYNX_EVENTS[name]
  if (binding?.accepts && !binding.accepts(event)) return null

  return {
    type: name,
    timestamp: Date.now(),
    target: describe(event.target instanceof Element ? event.target : element),
    currentTarget: describe(element),
    // Present on every event so a handler can always reach for it. There is no
    // `preventDefault` beside it on purpose — see the note at the top.
    stopPropagation: () => {
      event.stopPropagation()
    },
    detail: {},
    ...binding?.payload(event, element),
  }
}
