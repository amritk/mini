import type { LynxElement } from './engine/element-api'
import { effect } from './signals'
import { createRawText, insert, setText } from './tree'
import type { MiniChildren } from './types'

/**
 * Attaches children to an element.
 *
 * Strings and numbers become `raw-text` elements, already-built elements are
 * moved in, arrays recurse, and `null`, `undefined` and booleans vanish — which
 * is what makes `{condition && <text>…</text>}` work as a build-time
 * conditional.
 *
 * A FUNCTION child is the reactive case: it gets its own `raw-text` node bound
 * to whatever signals it reads. The dedicated node matters, because it means a
 * reactive child sitting beside static siblings only ever rewrites itself and
 * never clobbers them — which on Lynx is also the difference between updating
 * one attribute and rebuilding a text run.
 *
 * ## A string is an element here
 *
 * On the web a text node is a different kind of thing from an element. In Lynx
 * it is not: a run of text is a `raw-text` ELEMENT that lives inside a `<text>`,
 * and nowhere else. That is why `<view>hello</view>` is a compile error in this
 * package rather than a blank screen on a device — see `ContainerChildren`.
 */
export const appendChildren = (element: LynxElement, children: MiniChildren): void => {
  if (children === null || children === undefined || typeof children === 'boolean') return

  if (Array.isArray(children)) {
    for (const child of children) appendChildren(element, child as MiniChildren)
    return
  }

  if (typeof children === 'function') {
    const get = children
    const node = createRawText('')
    effect(() => {
      const value = get()
      setText(node, value === null || value === undefined || value === false ? '' : String(value))
    })
    insert(element, node, null)
    return
  }

  if (isElement(children)) {
    insert(element, children, null)
    return
  }

  insert(element, createRawText(String(children)), null)
}

/**
 * Distinguishes an already-built element from a primitive child.
 *
 * Engine elements are opaque to the runtime, so there is nothing structural to
 * test for. What we can say is that every remaining primitive child is a string
 * or a number by this point, so anything that is an object came out of the
 * engine and belongs in the tree as-is.
 */
const isElement = (child: unknown): child is LynxElement => typeof child === 'object' && child !== null
