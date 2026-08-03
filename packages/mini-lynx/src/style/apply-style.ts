import { requireEngine, scheduleFlush } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import type { StyleValue } from '../types'
import { toCssName } from './to-css-name'
import { toStyleText } from './to-style-text'

/**
 * Writes an element's style, and keeps `show` working across a style write.
 *
 * ## The invariant this file exists for
 *
 * Lynx expresses an element's style bag and its visibility through ONE channel,
 * and `__SetInlineStyles` replaces that channel wholesale. So a style write on
 * a hidden element un-hides it — and whether that happens depends on the order
 * the props were written in, which makes it an intermittent bug rather than a
 * reproducible one. Remembering the two parts separately lets a style write
 * re-assert the hidden state, and lets showing an element again restore the
 * `display` its own style asked for rather than clearing the property.
 *
 * ## The two conversions
 *
 * Both are the runtime's job and both are silent when skipped, which is why
 * they are here rather than left to the caller:
 *
 * - **Keys take their CSS spelling.** `__SetInlineStyles` is handed
 *   declarations that the engine parses as CSS, where `fontSize` has never been
 *   a property. A style bag may be written either way — `fontSize` and
 *   `font-size` are the same property everywhere in this package — so the
 *   conversion happens once, here.
 * - **A bare number is density-independent pixels.** `{ width: 100 }` means a
 *   hundred pixels, matching every native toolkit, and the unitless properties
 *   stay unitless. See {@link toStyleText}.
 */

/** What the runtime remembers per element, since one channel serves two features. */
type StyleState = {
  /**
   * What the element's own `style` prop last asked for — a bag or CSS text.
   *
   * The string form is remembered as well as the object form, and that is not
   * symmetry for its own sake: showing an element re-applies whatever is here,
   * so a `null` left behind by a string write would come back as an EMPTY bag
   * and `__SetInlineStyles` would wipe the element's styling wholesale. It did,
   * until a test caught it.
   */
  style: StyleValue | string | null
  /**
   * The `display` the bag asked for, or `null` when it asked for none.
   *
   * Only ever populated for the object form. CSS text is not parsed here — that
   * would mean shipping a CSS parser to serve a case the object form covers
   * better — so a string style that sets `display` and is then hidden and shown
   * comes back through the string itself rather than through this field.
   */
  styleDisplay: string | null
  /** Whether `show` has hidden this element. */
  hidden: boolean
}

const states = new WeakMap<LynxElement, StyleState>()

const stateOf = (element: LynxElement): StyleState => {
  const existing = states.get(element)
  if (existing) return existing
  const created: StyleState = { style: null, styleDisplay: null, hidden: false }
  states.set(element, created)
  return created
}

/** Applies an element's own style bag, re-asserting visibility on top of it. */
export const applyStyle = (element: LynxElement, value: StyleValue | string | null): void => {
  const engine = requireEngine()
  const state = stateOf(element)

  if (typeof value === 'string') {
    // CSS text passes through untouched: it is already declarations, and
    // re-parsing it here to find a `display` would mean shipping a CSS parser
    // to serve a case the object form covers better.
    state.style = value
    state.styleDisplay = null
    engine.__SetInlineStyles(element, value)
  } else {
    state.style = value
    // An empty bag is how a style is cleared, since the write replaces
    // whatever was there before.
    const declarations = value === null ? {} : toDeclarations(value)
    state.styleDisplay = declarations['display'] ?? null
    engine.__SetInlineStyles(element, declarations)
  }

  if (state.hidden) engine.__AddInlineStyle(element, 'display', 'none')
  scheduleFlush()
}

/**
 * Shows or hides an element in place.
 *
 * Hiding adds one declaration. SHOWING re-applies the element's own style bag
 * rather than writing some default back, and that asymmetry is deliberate:
 * Lynx's default display is `linear`, not `flex`, and it is configurable
 * per-page through `defaultDisplayLinear` — so any constant this file picked
 * would be wrong for somebody, and wrong in the quiet way where the element
 * appears but lays its children out along the other axis.
 *
 * Re-applying the bag sidesteps the question entirely: an element whose style
 * asked for a `display` gets that one back, and an element whose style said
 * nothing about it ends up with no declaration at all, which is the only honest
 * way to spell "whatever this element would have done on its own".
 */
export const applyVisible = (element: LynxElement, visible: boolean): void => {
  const state = stateOf(element)
  state.hidden = !visible

  if (!visible) {
    requireEngine().__AddInlineStyle(element, 'display', 'none')
    scheduleFlush()
    return
  }

  // `applyStyle` re-asserts `hidden` at the end, which is now false, so this
  // both restores the bag and drops the `display: none` in one write.
  applyStyle(element, state.style)
}

/**
 * Stringifies a style bag into CSS declarations, dropping the entries that mean
 * "unset".
 *
 * `for…in` rather than `Object.entries`, which would allocate an array and a
 * pair per declaration every time a reactive style re-runs — which is once a
 * frame for anything animated, on the main thread.
 */
const toDeclarations = (value: StyleValue): Record<string, string> => {
  const declarations: Record<string, string> = {}
  for (const key in value) {
    const entry = value[key]
    if (entry === null || entry === undefined || entry === false) continue
    declarations[toCssName(key)] = toStyleText(key, entry)
  }
  return declarations
}
