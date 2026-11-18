/** A cloned template instance: the root element plus every `data-ref` node inside it. */
export type TemplateInstance = {
  root: HTMLElement
  ref: Record<string, HTMLElement>
}

/**
 * Parses a static HTML string once and returns a clone factory. Each call
 * clones the parsed tree and collects every `data-ref="name"` node into
 * `ref.name`, which replaces both a template compiler and manual
 * `createElement` chains.
 *
 * The `data-ref` lookup happens once, at parse time: each ref is remembered as
 * its path of child indexes from the root, and a clone just walks those paths.
 * Running `querySelectorAll('[data-ref]')` on every clone instead was a
 * measurable share of a row's creation cost — about a quarter of the script
 * time when building ten thousand rows — and a clone has exactly the shape of
 * the tree it came from, so the answer never changes between calls.
 *
 * Safety: the argument must be a static string literal with no interpolated
 * data — dynamic content flows through the bind helpers, which use
 * `textContent`. This keeps `template` off the XSS surface entirely.
 *
 * @example
 * ```ts
 * const row = template('<li><span data-ref="label"></span></li>')
 * const { root, ref } = row()
 * const count = signal(0)
 * bindText(ref.label, () => `${count()} items`) // dynamic data via bind, not interpolation
 * document.body.append(root)
 * ```
 */
export const template = (html: string): (() => TemplateInstance) => {
  const parsed = document.createElement('template')
  parsed.innerHTML = html
  const proto = parsed.content.firstElementChild as HTMLElement
  // Each ref's name and its path from the root, one entry per level: how many
  // element siblings to step past after descending to the first child.
  const paths: [name: string, path: number[]][] = []
  const collect = (node: HTMLElement, path: number[]): void => {
    const name = node.dataset['ref']
    if (name !== undefined) paths.push([name, path])
    let index = 0
    for (let child = node.firstElementChild; child; child = child.nextElementSibling)
      collect(child as HTMLElement, [...path, index++])
  }
  collect(proto, [])

  return () => {
    // Cloning the element rather than the whole fragment skips a wrapper node
    // nobody uses.
    const root = proto.cloneNode(true) as HTMLElement
    const ref: Record<string, HTMLElement> = {}
    for (const [name, path] of paths) {
      // Sibling pointers, not `children[index]`: indexing the live collection
      // measured slower, and this walk is the per-row hot path.
      let node: Element = root
      for (let steps of path) {
        node = node.firstElementChild as Element
        while (steps--) node = node.nextElementSibling as Element
      }
      ref[name] = node as HTMLElement
    }
    return { root, ref }
  }
}
