import { requireEngine } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { pageElement } from '../mount'

/**
 * Finding an element you did not build.
 *
 * Almost nothing in this runtime needs these: a component holds a reference to
 * every element it created, and `ref` hands one to you at build time, which is
 * cheaper and cannot go stale. They exist for the case a reference genuinely
 * cannot cover — reaching an element another component owns, or one the engine
 * built for you — which is also the case where the alternative is an app
 * threading a ref through four layers of props.
 *
 * The selector engine is the ENGINE's, not this package's. That means it is the
 * same one the stylesheet uses, matching on the same ids and classes, and it
 * means an element created with an out-of-range `parentComponentUniqueId` is
 * invisible here for exactly the reason it is invisible to CSS. It also means
 * the supported selector syntax is the engine's to define and this package
 * makes no claims about it.
 */

/**
 * The first descendant of `root` matching `selector`, or `null`.
 *
 * Searches from the page element when no root is given, which is what an app
 * usually wants and what the engine's own main-thread `querySelector` does.
 *
 * @example
 * ```ts
 * const banner = querySelector('#banner')
 * if (banner) await invoke(banner, 'scrollIntoView', { scrollIntoViewOptions: { block: 'start' } })
 * ```
 */
export const querySelector = (selector: string, root?: LynxElement): LynxElement | null => {
  const engine = requireEngine()
  if (!engine.__QuerySelector) {
    throw new Error('This engine has no __QuerySelector. Selector queries need Lynx 2.14 or newer.')
  }
  return engine.__QuerySelector(root ?? pageElement(), selector, {}) ?? null
}

/** Every descendant of `root` matching `selector`, in tree order. */
export const querySelectorAll = (selector: string, root?: LynxElement): readonly LynxElement[] => {
  const engine = requireEngine()
  if (!engine.__QuerySelectorAll) {
    throw new Error('This engine has no __QuerySelectorAll. Selector queries need Lynx 2.14 or newer.')
  }
  return engine.__QuerySelectorAll(root ?? pageElement(), selector, {})
}
