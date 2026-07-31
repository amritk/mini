import { requireEngine, scheduleFlush } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { effect } from '../signals'
import { toAttributeValue } from '../to-attribute-value'
import type { Dispose } from '../types'

/**
 * Keeps one attribute in sync with a getter. `false`, `null`, and `undefined`
 * clear it, so the same helper covers the engine's boolean attributes —
 * `disabled`, `readonly`, `focusable` — without a second binding that knows
 * about attribute presence.
 *
 * The name is the engine's own spelling (`text-maxline`, `confirm-type`,
 * `accessibility-label`), which is the rule `applyProp` follows too: there is no
 * translation table in this package, so Lynx's documentation is this runtime's
 * documentation and a new engine attribute needs no release here to be usable.
 */
export const bindProp = (element: LynxElement, name: string, get: () => unknown): Dispose =>
  effect(() => {
    const value = get()
    const absent = value === null || value === undefined || value === false
    requireEngine().__SetAttribute(element, name, absent ? null : toAttributeValue(name, value))
    scheduleFlush()
  })
