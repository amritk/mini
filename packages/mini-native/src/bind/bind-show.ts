import type { LynxElement } from '../engine/element-api'
import { effect } from '../signals'
import { applyVisible } from '../style/apply-style'
import type { Dispose } from '../types'

/**
 * Keeps an element's visibility in sync with a getter, hiding it in place
 * rather than detaching it.
 *
 * Hiding beats removing whenever the element comes back — there is no teardown
 * and no rebuild, so any state inside it survives. When the element should
 * genuinely leave the tree (and stop reacting), reach for `Show` instead.
 *
 * It goes through {@link applyVisible} rather than writing `display` itself,
 * because visibility and the element's own style bag share one channel on
 * Lynx. A later style write would otherwise un-hide a hidden element, and
 * whether it did would depend on the order the props happened to be written in
 * — an intermittent bug rather than a reproducible one. That file remembers the
 * two halves separately so neither can quietly erase the other, and it is also
 * where the rule lives that showing an element restores its own bag instead of
 * writing some default `display` back.
 */
export const bindShow = (element: LynxElement, get: () => boolean): Dispose =>
  effect(() => applyVisible(element, get()))
