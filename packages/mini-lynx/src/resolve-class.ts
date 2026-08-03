import type { ClassValue } from './types'

/**
 * Collapses a {@link ClassValue} — a string, an array, or a toggle map — into
 * the single space-joined string every host receives.
 *
 * Resolving here rather than in each host means the three input forms are
 * defined once and cannot drift between targets, and a host that has no class
 * concept only has to deal with a plain string.
 *
 * Arrays resolve their entries recursively, so nesting composes instead of
 * stringifying: `['card', shared]` where `shared` is itself an array or a toggle
 * map produces the flattened list, not the comma-joined mess `String()` would
 * make of it. That matters because building class lists from shared fragments
 * is the ordinary way people use this.
 *
 * ## Why this accumulates instead of map/filter/join
 *
 * A reactive `class` is the binding an app re-runs most — a selected row, a
 * pressed button, an open sheet — and it re-runs on the main thread, in the same
 * frame as the tap that caused it. The obvious spelling
 * (`value.map(resolveClass).filter(Boolean).join(' ')`) allocates three arrays
 * per array level and four per toggle map, every time, to produce one string.
 * Collecting into a single accumulator produces exactly the same string and
 * allocates that accumulator and nothing else. The extra function below is the
 * whole cost of saying it that way.
 */
export const resolveClass = (value: unknown): string => {
  // A plain string is already the answer, and it is the form nearly every call
  // takes. Routing it through the accumulator would build the same string twice.
  if (typeof value === 'string') return value

  const names: string[] = []
  collect(value, names)
  return names.join(' ')
}

/** Appends the class names `value` contributes, in source order, to `names`. */
const collect = (value: unknown, names: string[]): void => {
  if (Array.isArray(value)) {
    for (const entry of value) collect(entry, names)
    return
  }

  if (value !== null && typeof value === 'object') {
    for (const name in value) {
      if ((value as Record<string, unknown>)[name]) names.push(name)
    }
    return
  }

  // Every falsy value drops out, not just the three the type permits. `0` and
  // `NaN` are reachable from untyped input — `count && 'badge'` hands one
  // straight through — and stringifying first would turn them into the perfectly
  // truthy class names "0" and "NaN".
  if (value) names.push(typeof value === 'string' ? value : String(value))
}
