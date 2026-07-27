import type { FakeLynxElement } from './fake-lynx'

/**
 * Renders a fake Lynx tree as indented text.
 *
 * The point of printing it at all is that this is the tree a DEVICE would show,
 * built from the same components the browser preview is rendering around it —
 * so the differences are the interesting part and they should be readable at a
 * glance. Three of them show up in almost every tree:
 *
 * - a `<text>` becomes a `text` element holding a `raw-text` child whose `text`
 *   attribute carries the string, because that is how Lynx represents a run;
 * - `role`, `testId` and the accessibility props arrive under the engine's own
 *   attribute names (`accessibility-role`, `data-testid`, …);
 * - every number in a style bag has become a string with a unit on it, since a
 *   style bag is density-independent pixels and applying the unit is the host's
 *   job on every target.
 */
export const serializeLynxTree = (node: FakeLynxElement, depth = 0): string => {
  const pad = '  '.repeat(depth)
  const attrs = Object.entries(node.attrs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ` ${name}=${JSON.stringify(value)}`)
    .join('')
  const styles = Object.entries(node.styles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ')
  const style = styles === '' ? '' : ` style="${styles}"`
  const classes = node.classes === '' ? '' : ` class="${node.classes}"`
  // Listener names rather than listener counts: which events an element carries
  // is the part worth reading, and a count would hide that `pointer` is four
  // engine listeners standing for one vocabulary prop.
  const events = [...node.events.entries()]
    .filter(([, listener]) => listener !== null)
    .map(([key]) => key.replace('bindEvent:', ''))
  const listeners = events.length === 0 ? '' : ` @${events.join(',')}`

  const line = `${pad}<${node.tag}${attrs}${classes}${style}${listeners}>`
  const children = node.children.map((child) => serializeLynxTree(child, depth + 1))
  return [line, ...children].join('\n')
}
