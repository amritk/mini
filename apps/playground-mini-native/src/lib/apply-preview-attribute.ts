/**
 * The handful of Lynx attributes the browser needs help with.
 *
 * Every attribute the PAPI is given is written onto the element under its Lynx
 * name — that is what makes the inspector show the same tree a device would.
 * For most of them that is the whole job: `<view accessibility-label>` means
 * nothing to a browser and means nothing here either, and pretending otherwise
 * would be inventing behaviour.
 *
 * A few are different, because the browser CAN honour them and the preview is
 * misleading if it does not: an `<image>` that shows nothing, a `<text>` that
 * ignores its line limit, an `<input>` that will not take a value. Those are
 * the entries below, and the list is deliberately short — every one of them is
 * an APPROXIMATION of a native behaviour rather than an implementation of it,
 * so each one is a small lie the preview tells, and a short list of small lies
 * is much easier to keep honest than a long one.
 *
 * ## Why the declarations are remembered
 *
 * Several entries work by writing an inline style, and `__SetInlineStyles`
 * replaces the inline style wholesale. So an app that writes a `style` prop
 * after its `mode` would silently lose the `object-fit`. The declarations this
 * module owns are kept per element and re-asserted by the PAPI after any write
 * that replaces them — see {@link reassertPreviewStyles}.
 */

/** The inline declarations this module owns, per element. */
const previewStyles = new WeakMap<Element, Map<string, string>>()

/** Writes one owned declaration, or drops it when the value is `null`. */
const own = (element: HTMLElement, property: string, value: string | null): void => {
  const owned = previewStyles.get(element) ?? new Map<string, string>()
  previewStyles.set(element, owned)

  if (value === null) {
    owned.delete(property)
    element.style.removeProperty(property)
    return
  }

  owned.set(property, value)
  element.style.setProperty(property, value)
}

/**
 * Re-applies the declarations this module owns.
 *
 * The PAPI calls this after any write that replaces or clears inline styles, so
 * that a `style` prop and a preview approximation can coexist on one element
 * instead of the last writer winning.
 */
export const reassertPreviewStyles = (element: HTMLElement): void => {
  const owned = previewStyles.get(element)
  if (!owned) return
  for (const [property, value] of owned) element.style.setProperty(property, value)
}

/** Whether a value means "this attribute is not set". */
const isAbsent = (value: unknown): boolean => value === null || value === undefined || value === ''

/** Lynx's `mode` values, and the `object-fit` that behaves the same way. */
const IMAGE_FITS: Readonly<Record<string, string>> = {
  scaleToFill: 'fill',
  aspectFit: 'contain',
  aspectFill: 'cover',
  center: 'none',
}

/**
 * Lynx's `<input type>` values, and the DOM type that behaves closest.
 *
 * `digit` is the only one with no web equivalent — it means "a number pad,
 * decimals allowed" — so it lands on `number`, which raises the same keyboard
 * on a phone and the same spinner on a desktop.
 */
const INPUT_TYPES: Readonly<Record<string, string>> = {
  text: 'text',
  number: 'number',
  digit: 'number',
  password: 'password',
  tel: 'tel',
  email: 'email',
}

/**
 * Announces a load or a failure the way `<image>` does.
 *
 * A custom element showing an image through CSS never fires a `load` of its
 * own, so the picture is fetched a second time through a real `Image` purely to
 * learn when it arrived and how big it is. The event is then dispatched at the
 * `<image>` itself, which is where a listener registered through `__AddEvent`
 * is waiting — so the whole thing stays inside the normal event path.
 *
 * A probe whose `src` has since been replaced is dropped rather than reported,
 * because a stale load arriving after a newer one would tell the app the wrong
 * size.
 */
const probeImage = (element: HTMLElement, src: string): void => {
  if (typeof Image === 'undefined') return

  const probe = new Image()
  const isCurrent = (): boolean => element.getAttribute('src') === src

  probe.addEventListener('load', () => {
    if (!isCurrent()) return
    const detail = { width: probe.naturalWidth, height: probe.naturalHeight }
    element.dispatchEvent(new CustomEvent('load', { detail }))
  })

  probe.addEventListener('error', () => {
    if (!isCurrent()) return
    const detail = { errMsg: `failed to load ${src}`, error_code: 0, lynx_categorized_code: 0 }
    element.dispatchEvent(new CustomEvent('error', { detail }))
  })

  probe.src = src
}

/**
 * The whole table, keyed by `tag:attribute`.
 *
 * Everything in here is a preview approximation, not a reimplementation of what
 * the engine does with the same attribute.
 *
 * Nothing is needed for `<input placeholder>`, `<input disabled>` and their
 * neighbours: Lynx's `<input>` and `<textarea>` happen to be spelled exactly
 * like the HTML controls, so reflecting the attribute is already the whole
 * mapping. That is luck rather than design, and it is why the table is this
 * short.
 */
const PREVIEW_ATTRIBUTES: Readonly<Record<string, (element: HTMLElement, value: unknown) => void>> = {
  // A string in Lynx is an ELEMENT carrying a `text` attribute, and updating it
  // writes that attribute rather than replacing a node. So the rendered text
  // has to follow the attribute, which is what makes `bindText` visible here.
  'raw-text:text': (element, value) => {
    element.textContent = isAbsent(value) ? '' : String(value)
  },

  // `content: url(…)` rather than a background, because it turns the custom
  // element into a REPLACED element — which is the only way `object-fit` below
  // has anything to act on.
  'image:src': (element, value) => {
    const src = isAbsent(value) ? null : String(value)
    own(element, 'content', src === null ? null : `url(${JSON.stringify(src)})`)
    if (src !== null) probeImage(element, src)
  },

  'image:mode': (element, value) => {
    own(element, 'object-fit', IMAGE_FITS[String(value)] ?? null)
  },

  // Lynx's line limit is part of text measurement; the web's is still only
  // reachable through the `-webkit-` box, and it needs all four declarations
  // together. `-1` is Lynx's "no limit".
  'text:text-maxline': (element, value) => {
    const lines = Number(value)
    const limited = Number.isFinite(lines) && lines > 0
    own(element, 'display', limited ? '-webkit-box' : null)
    own(element, '-webkit-box-orient', limited ? 'vertical' : null)
    own(element, '-webkit-line-clamp', limited ? String(lines) : null)
    own(element, 'overflow', limited ? 'hidden' : null)
  },

  // The attribute only ever seeds a control's initial value, so writing it
  // would leave the field showing whatever the user last typed. The property is
  // the live one.
  'input:value': (element, value) => {
    ;(element as HTMLInputElement).value = isAbsent(value) ? '' : String(value)
  },

  'textarea:value': (element, value) => {
    ;(element as HTMLTextAreaElement).value = isAbsent(value) ? '' : String(value)
  },

  // Written back over the reflected attribute, so the element ends up carrying
  // the DOM spelling rather than Lynx's. That costs a little inspector fidelity
  // and buys a field that actually behaves like the one on the device — an
  // `<input type="digit">` in a browser is just a text box.
  'input:type': (element, value) => {
    element.setAttribute('type', INPUT_TYPES[String(value)] ?? 'text')
  },

  // A native scroller scrolls exactly one way, so the cross axis is pinned
  // rather than left to spill.
  'scroll-view:scroll-orientation': (element, value) => {
    const horizontal = value === 'horizontal'
    own(element, 'overflow-x', horizontal ? 'auto' : 'hidden')
    own(element, 'overflow-y', horizontal ? 'hidden' : 'auto')
  },
}

/**
 * Applies the preview behaviour for one attribute, if it has any.
 *
 * Called after the attribute has already been reflected onto the element, so an
 * entry here is free to read it back — `probeImage` does exactly that to tell a
 * stale load from a current one.
 */
export const applyPreviewAttribute = (element: HTMLElement, name: string, value: unknown): void => {
  PREVIEW_ATTRIBUTES[`${element.localName}:${name}`]?.(element, value)
}
