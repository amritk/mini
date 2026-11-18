// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'

import { template } from './template'

describe('template', () => {
  it('clones the parsed structure on every call', () => {
    const make = template('<div class="a"><span>hi</span></div>')
    const first = make()
    const second = make()
    expect(first.root).not.toBe(second.root)
    expect(first.root.outerHTML).toBe('<div class="a"><span>hi</span></div>')
  })

  it('collects data-ref nodes, including the root itself', () => {
    const make = template('<div data-ref="root"><button data-ref="send"></button><i></i></div>')
    const { root, ref } = make()
    expect(ref['root']).toBe(root)
    expect(ref['send']?.tagName).toBe('BUTTON')
    expect(Object.keys(ref)).toHaveLength(2)
  })

  it('keeps clones independent', () => {
    const make = template('<div><p data-ref="p"></p></div>')
    const first = make()
    const second = make()
    ;(first.ref['p'] as HTMLElement).textContent = 'changed'
    expect(second.ref['p']?.textContent).toBe('')
  })

  it('finds refs past whitespace, text and nested siblings', () => {
    // Refs are resolved by walking element siblings, so text nodes between
    // elements must not shift which node a path lands on.
    const make = template(`
      <ul>
        text before
        <li><b></b><i data-ref="first"></i></li>
        <!-- a comment -->
        <li>
          <span></span>
          <span><em></em><strong data-ref="deep"></strong></span>
        </li>
        <li data-ref="last"></li>
      </ul>`)
    const { root, ref } = make()
    expect(root.tagName).toBe('UL')
    expect(ref['first']?.tagName).toBe('I')
    expect(ref['deep']?.tagName).toBe('STRONG')
    expect(ref['last']).toBe(root.lastElementChild)
    // Every ref belongs to this clone, not to the parsed original.
    expect(root.contains(ref['deep'] as HTMLElement)).toBe(true)
  })

  it('resolves refs on every clone, not just the first', () => {
    const make = template('<div><p></p><p data-ref="second"></p></div>')
    const first = make()
    const second = make()
    expect(first.ref['second']).toBe(first.root.children[1])
    expect(second.ref['second']).toBe(second.root.children[1])
    expect(first.ref['second']).not.toBe(second.ref['second'])
  })

  it('lets the last node in document order win a repeated name', () => {
    const make = template('<div data-ref="x"><p data-ref="x"></p><span data-ref="x"></span></div>')
    const { ref } = make()
    expect(ref['x']?.tagName).toBe('SPAN')
  })

  it('finds refs inside SVG markup', () => {
    // SVG elements carry `dataset` too, so refs inside an icon resolve like any
    // other; this pins that the walk does not quietly assume HTML elements.
    const make = template('<div><svg viewBox="0 0 8 8"><g><path data-ref="icon" d="M0 0h8"></path></g></svg></div>')
    const { ref } = make()
    expect(ref['icon']?.tagName.toLowerCase()).toBe('path')
    expect(ref['icon']?.getAttribute('d')).toBe('M0 0h8')
  })

  it('returns an empty ref map for a template without refs', () => {
    expect(template('<div><p></p></div>')().ref).toEqual({})
  })
})
