import { jsx } from '../jsx-runtime'
import type { ContainerChild, ContainerChildren, MiniChild, MiniChildren } from '../types'

/**
 * Gives a bare text run the `text` element a native target needs, so the
 * components that carry a label can be written the way everyone writes them.
 *
 * `<Button>Save</Button>` is the ordinary line, and `Button` builds a container
 * — which refuses a text run, deliberately, because on a device a run outside a
 * `text` element renders nothing and the screen comes up silently blank. The
 * choice is therefore between `<Button><Text>Save</Text></Button>` at every call
 * site and putting the element in here.
 *
 * It belongs HERE and nowhere lower down. The runtime keeps refusing bare text
 * inside a container, at the type level, because that is a mistake with no
 * correct reading; a component is different — it is a thing with an opinion
 * about its own contents, its label needs a text element on every target
 * regardless, and the wrap is one visible line in one file rather than a node
 * the framework inserts behind everyone's back. That distinction is the reason
 * `appendChildren` must never grow this behaviour.
 *
 * Anything already built into a host node passes through untouched, so an icon
 * beside a label is unaffected, and a function child stays a function — it goes
 * into the `text` element as a reactive text binding, exactly as it would have.
 */
export const wrapTextRuns = (children: MiniChildren): ContainerChildren =>
  Array.isArray(children) ? children.map(wrapOne) : wrapOne(children as MiniChild)

/** Wraps one child if it is a text run, and leaves every other kind alone. */
const wrapOne = (child: MiniChild): ContainerChild =>
  typeof child === 'string' || typeof child === 'number' || typeof child === 'function'
    ? jsx('text', { children: child })
    : child
