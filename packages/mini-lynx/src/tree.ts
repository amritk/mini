import { onEngineChange, requireEngine, scheduleFlush } from './engine/current-engine'
import type { LynxElement } from './engine/element-api'

/**
 * Tree surgery, as the rest of the runtime wants to say it.
 *
 * A thin layer over the PAPI rather than a second abstraction: every function
 * here is one or two engine calls, and its job is to put the rules that are
 * easy to get wrong in ONE place rather than at every call site.
 *
 * Two of those rules are worth naming, because both are silent when broken:
 *
 * **An insert detaches first**, so inserting a node that already has a parent
 * MOVES it. `list` depends on this — a reordered row is repositioned rather
 * than rebuilt — and the engine's `__InsertElementBefore` does not do it for
 * you. Left out, a reorder would leave the row in both places on some engine
 * builds and in neither on others.
 *
 * **Every mutation schedules a commit.** Nothing reaches the screen until the
 * tree is flushed, and a function that mutates without scheduling produces a
 * change that appears only when something else happens to flush afterwards —
 * which is the worst possible bug shape, because it looks like a race.
 */

/**
 * Creates an element of the given tag, through the engine's dedicated creator
 * when the tag has one.
 *
 * That preference is a correctness requirement rather than an optimisation:
 * `__CreateElement('view', …)` builds a generic fiber node that is not a view,
 * and the difference shows up as missing behaviour rather than as an error —
 * see the note on `LynxElementApi`. Tags with no dedicated creator (`input`,
 * `textarea`, `svg`, every XElement) go through `__CreateElement`, which is
 * exactly what it is for.
 */
export const createElement = (tag: string): LynxElement => {
  const engine = requireEngine()
  const id = componentId()
  const creator = CREATORS[tag]
  const create = creator === undefined ? undefined : engine[creator]
  const element = create ? create.call(engine, id) : engine.__CreateElement(tag, id, {})
  scheduleFlush()
  return element
}

/**
 * The tags the engine builds through a dedicated creator, and which one.
 *
 * **`list` is deliberately absent, and it is the one entry worth explaining.**
 * The engine has a `__CreateList`, but its signature is not
 * `(parentComponentUniqueId)` like the others — it takes the recycling
 * callbacks (`componentAtIndex`, `enqueueComponent`) the framework must
 * implement, so there is nothing sensible to call it with from here, where all
 * this function has is a tag.
 *
 * Those callbacks now exist, in `recycle/`, and that is where a recycling list
 * is created: `recycle()` builds the element itself because it is the only
 * caller with something to pass. A `<list>` written as an ordinary JSX tag
 * still comes through here and is still built generically — it scrolls and lays
 * out, and every row is realised up front. That is the right shape for a
 * collection a screen can show; past that, reach for `@amritk/mini-lynx/recycle`.
 */
const CREATORS: Readonly<
  Record<string, '__CreateView' | '__CreateText' | '__CreateImage' | '__CreateScrollView' | '__CreateFrame'>
> = {
  view: '__CreateView',
  text: '__CreateText',
  image: '__CreateImage',
  'scroll-view': '__CreateScrollView',
  frame: '__CreateFrame',
}

/**
 * The `parentComponentUniqueId` every creator is given: the page's own id.
 *
 * **Not `0`.** Passing zero looks like a harmless "no owning component" sentinel
 * and is not one — engine ids start well above it, so zero is simply out of
 * range, and an element created with it silently drops out of class, id and tag
 * SELECTOR RESOLUTION. The tree renders, inline styles work, and every
 * stylesheet rule quietly misses. That is a whole styling channel disappearing
 * with nothing to indicate why, which is worth the one lazy lookup this costs.
 *
 * Resolved on first use rather than at install time because the page element is
 * the engine's to hand over and it is not necessarily there yet, and cached
 * because it cannot change for the life of a page.
 */
let cachedComponentId: number | null = null

const componentId = (): number => {
  if (cachedComponentId !== null) return cachedComponentId
  const engine = requireEngine()
  const page = engine.__GetPageElement?.()
  // A fake engine has neither call, and zero is harmless there precisely
  // because it has no selector engine for the id to matter to.
  cachedComponentId = (page && engine.__GetElementUniqueID?.(page)) ?? 0
  return cachedComponentId
}

// Swapping the engine invalidates the id, since it belonged to the old one's
// page. Only tests swap, but a stale id there would be a confusing failure in
// the one place that is meant to be easy to reason about.
onEngineChange(() => {
  cachedComponentId = null
})

/**
 * Creates a text run.
 *
 * A string is an ELEMENT in Lynx — `raw-text` — not a property of its parent,
 * which is why a bare string is illegal inside a `<view>` and legal inside a
 * `<text>`.
 */
export const createRawText = (value: string): LynxElement => {
  const node = requireEngine().__CreateRawText(value)
  scheduleFlush()
  return node
}

/** Updates a text run in place. */
export const setText = (node: LynxElement, value: string): void => {
  requireEngine().__SetAttribute(node, 'text', value)
  scheduleFlush()
}

/**
 * Creates a wrapper — an element that holds children without taking part in
 * layout or in the accessibility tree.
 *
 * This is the slot every control-flow component owns. On a target with no such
 * concept it would have to be a real container view, which then sits between a
 * `role="list"` and its items and quietly breaks the relationship; Lynx having
 * a first-class wrapper removes the problem rather than working around it.
 */
export const createWrapper = (): LynxElement => {
  const wrapper = requireEngine().__CreateWrapperElement(componentId())
  scheduleFlush()
  return wrapper
}

/**
 * Puts a node under a parent, before `anchor` or at the end.
 *
 * Detaches first, so this doubles as a move — see the note above.
 */
export const insert = (parent: LynxElement, node: LynxElement, anchor: LynxElement | null): void => {
  const engine = requireEngine()
  const currentParent = engine.__GetParent(node)
  if (currentParent) engine.__RemoveElement(currentParent, node)

  if (anchor === null) engine.__AppendElement(parent, node)
  else engine.__InsertElementBefore(parent, node, anchor)
  scheduleFlush()
}

/** Takes a node out of the tree. A node with no parent is left alone. */
export const remove = (node: LynxElement): void => {
  const engine = requireEngine()
  const parent = engine.__GetParent(node)
  if (parent) engine.__RemoveElement(parent, node)
  scheduleFlush()
}

/** Empties an element of its children. */
export const clear = (element: LynxElement): void => {
  const engine = requireEngine()
  for (const child of engine.__GetChildren(element)) engine.__RemoveElement(element, child)
  scheduleFlush()
}

export const firstChild = (element: LynxElement): LynxElement | null => requireEngine().__FirstElement(element)

export const nextSibling = (node: LynxElement): LynxElement | null => requireEngine().__NextElement(node)
