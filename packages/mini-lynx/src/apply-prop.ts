import { addEvent } from './add-event'
import { requireEngine, scheduleFlush } from './engine/current-engine'
import type { LynxElement } from './engine/element-api'
import { onCleanup } from './on-cleanup'
import { resolveClass } from './resolve-class'
import { effect } from './signals'
import { applyStyle, applyVisible } from './style/apply-style'
import { toAttributeValue } from './to-attribute-value'
import type { StyleValue } from './types'

/**
 * Applies one JSX prop to an element, deciding static-or-reactive from the
 * SHAPE of the value: a function tracks, anything else is applied once and
 * never again.
 *
 * Nothing is returned, because nothing needs disposing by the caller. Reactive
 * props become effects, which the enclosing scope disposes on its own, and
 * event listeners register their own `onCleanup` — so a subtree that leaves the
 * tree detaches its listeners without the runtime tracking them.
 *
 * `children`, `key` and `ref` never reach here: those describe an element's
 * structure rather than its properties, so the runtime handles them itself.
 *
 * ## Props are spelled the way Lynx spells them
 *
 * There is no translation table in this package, and that is the point. An
 * attribute is written exactly as the engine names it — `text-maxline`, `mode`,
 * `scroll-orientation` — and an event exactly as a Lynx template writes it:
 * `bindtap`, `catchtap`, `capture-bindtap`.
 *
 * So the engine's documentation is this runtime's documentation, a new engine
 * attribute needs no release here to become usable, and the entire class of bug
 * where a prop works in a preview and silently does nothing on a device cannot
 * occur — there is no second spelling for it to be lost in translation between.
 */
export const applyProp = (element: LynxElement, name: string, value: unknown): void => {
  if (name === 'show') {
    // Wrapping a static boolean in a getter means one code path serves both
    // forms, so `show={false}` behaves exactly like a tracked one.
    const get = typeof value === 'function' ? (value as () => boolean) : () => value as boolean
    bind(value, () => applyVisible(element, Boolean(get())))
    return
  }

  if (name === 'style') {
    bind(value, (current) => applyStyle(element, (current ?? null) as StyleValue | string | null))
    return
  }

  if (name === 'class') {
    bind(value, (current) => {
      requireEngine().__SetClasses(element, resolveClass(current))
      scheduleFlush()
    })
    return
  }

  if (name === 'id') {
    // `id` has its own PAPI call rather than being an attribute, because it is
    // what an id selector and a `SelectorQuery` match on.
    bind(value, (current) => {
      requireEngine().__SetID(element, current === null || current === undefined ? null : String(current))
      scheduleFlush()
    })
    return
  }

  const event = eventOf(name)
  if (event !== null && typeof value === 'function') {
    onCleanup(addEvent(element, event.type, event.name, value as (event: unknown) => void))
    return
  }

  bind(value, (current) => {
    // Only `null` and `undefined` clear an attribute. **`false` is a value**,
    // and passing it through is the whole difference between a runtime that can
    // express Lynx and one that can nearly express it.
    //
    // The web habit is the opposite — `disabled={false}` means "no attribute",
    // because HTML boolean attributes are true by their presence. Lynx is not
    // HTML: `flatten`, `accessibility-element` and `accessibility-disabled` all
    // default to something other than false, so `flatten={false}` is a stated
    // opt-out and swallowing it leaves the element doing the opposite of what
    // the source says. There is no way to write it back afterwards either,
    // which is what makes this the runtime's decision rather than an app's.
    const absent = current === null || current === undefined
    requireEngine().__SetAttribute(element, name, absent ? null : toAttributeValue(name, current))
    scheduleFlush()
  })
}

/**
 * The five ways Lynx binds an event, and the type string each maps to.
 *
 * | prop prefix | engine type | phase | propagation |
 * | --- | --- | --- | --- |
 * | `bind` | `bindEvent` | bubble | continues to ancestors |
 * | `catch` | `catchEvent` | bubble | stops at this element |
 * | `capture-bind` | `capture-bind` | capture | continues down |
 * | `capture-catch` | `capture-catch` | capture | stops at this element |
 * | `global-bind` | `global-bindEvent` | — | fires wherever the event occurs |
 *
 * **The `Event` suffix is irregular and that is not a typo here.** `bind`,
 * `catch` and `global-bind` gain it; the two `capture-` forms do not. The engine
 * string-compares these, so normalising them into something tidier would produce
 * a type it does not recognise and a listener that never fires. The table is
 * ugly because the thing it describes is.
 *
 * Order matters too. The longer prefixes have to be tested first, or
 * `capture-bindtap` would match the `bind` arm and register a bubble-phase
 * listener for an event named `capture-tap`, which nothing emits.
 */
const PREFIXES: readonly (readonly [prefix: string, type: string])[] = [
  ['capture-catch', 'capture-catch'],
  ['capture-bind', 'capture-bind'],
  ['global-bind', 'global-bindEvent'],
  ['catch', 'catchEvent'],
  ['bind', 'bindEvent'],
]

/**
 * One prop's parse, or `null` for a prop that is not an event.
 *
 * Shared between every element that spells the prop the same way, since it is
 * cached by name — so treat it as read-only. Nothing here has a reason to write
 * to one, and a caller that did would change the parse for every other element.
 */
type EventProp = { readonly type: string; readonly name: string } | null

/**
 * Every prop name this runtime has parsed, and what it parsed to.
 *
 * The answer depends on nothing but the string, and an app writes props from a
 * small fixed vocabulary — `class`, `bindtap`, `data-testid` — that every one of
 * its elements repeats. Without the cache each of those pays six `startsWith`
 * scans on the way to `__SetAttribute`, on the main thread, once per element
 * built; with it, each distinct spelling is scanned exactly once for the life of
 * the app. The table is bounded by the number of prop names in the source, so
 * there is nothing here to evict.
 */
const parsed = new Map<string, EventProp>()

/** Splits an event prop into the engine's `(type, name)` pair, or `null` if it is not one. */
const eventOf = (prop: string): EventProp => {
  const cached = parsed.get(prop)
  // `undefined` is the miss; a parsed non-event is stored as `null` and is a hit.
  if (cached !== undefined) return cached
  const result = parseEvent(prop)
  parsed.set(prop, result)
  return result
}

/** The actual scan, run once per distinct prop name. {@link eventOf} is what call sites use. */
const parseEvent = (prop: string): EventProp => {
  // A `main-thread:` prefix is accepted and dropped. This runtime already runs
  // on the main thread — driving the Element PAPI is what puts it there — so
  // `main-thread:bindtap` and `bindtap` are the same listener here. Accepting
  // the spelling means a component pasted out of a Lynx codebase keeps working
  // rather than silently losing its handler.
  const name = prop.startsWith('main-thread:') ? prop.slice('main-thread:'.length) : prop

  for (const [prefix, type] of PREFIXES) {
    if (name.startsWith(prefix) && name.length > prefix.length) {
      return { type, name: name.slice(prefix.length) }
    }
  }
  return null
}

/** Applies once for a plain value, or on every change for a getter. */
const bind = (value: unknown, apply: (current: unknown) => void): void => {
  if (typeof value === 'function') {
    const get = value as () => unknown
    effect(() => apply(get()))
    return
  }
  apply(value)
}
