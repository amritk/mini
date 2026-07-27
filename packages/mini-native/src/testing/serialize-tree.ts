import type { FakeElement } from './create-fake-engine'

/**
 * Renders a fake engine's tree as indented text.
 *
 * Assertions read far better against one string than against a walk of nested
 * objects, and a diff on failure shows the shape that actually rendered rather
 * than the first property that happened to differ. It is also the honest way to
 * show what a device would build: a `<text>` really does hold a `raw-text`
 * child, control flow really does interpose a `wrapper`, and a style bag really
 * has become CSS declarations with units on them by this point.
 *
 * Only what a test would assert on is included — tag, id, classes, attributes,
 * styles, and which events are bound. Parent links are relationships rather
 * than rendered output, and the call log is a separate question.
 */
export const serializeTree = (node: FakeElement, depth = 0): string => {
  const pad = '  '.repeat(depth)

  const id = node.elementId === null ? '' : ` #${node.elementId}`
  const classes = node.classes === '' ? '' : ` .${node.classes.split(/\s+/).join('.')}`

  const attrs = Object.entries(node.attrs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ` ${name}=${JSON.stringify(value)}`)
    .join('')

  const declarations = Object.entries(node.styles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ')
  const style = declarations === '' ? '' : ` style="${declarations}"`

  // Names rather than a count: which events an element carries is the part
  // worth reading, and the type prefix is what distinguishes a `catch` from a
  // `bind` — a difference that decides whether a tap reaches an ancestor.
  const events = [...node.events.entries()]
    .filter(([, listener]) => listener !== null)
    .map(([key]) => key.replace('bindEvent:', '@').replace('catchEvent:', '@catch:'))
    .sort()
  const listeners = events.length === 0 ? '' : ` ${events.join(' ')}`

  const line = `${pad}<${node.tag}${id}${classes}${attrs}${style}${listeners}>`
  return [line, ...node.children.map((child) => serializeTree(child, depth + 1))].join('\n')
}
