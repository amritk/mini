import type { LynxElement } from '../engine/element-api'
import { effect } from '../signals'
import { setText } from '../tree'
import type { Dispose } from '../types'

/**
 * Keeps a text run's content equal to the getter's value.
 *
 * The node is an ordinary element here — a `raw-text`, which is what a string
 * IS in Lynx — so updating it writes one attribute rather than replacing a
 * node. That is also why `appendChildren` gives every reactive child a
 * `raw-text` of its own: rewriting the run costs a single attribute write and
 * leaves its static siblings alone.
 *
 * Nothing on this path parses markup, and there is no call in the PAPI this
 * package drives that would accept any, so bound data cannot inject elements
 * into the tree.
 */
export const bindText = (node: LynxElement, get: () => string): Dispose => effect(() => setText(node, get()))
