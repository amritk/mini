// @vitest-environment happy-dom
import type { LynxElement, LynxElementApi } from '@amritk/mini-lynx/engine'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDomPapi } from './dom-papi'

/**
 * Every case gets its own root, so one test's page element cannot be found by
 * the next one's selector. The stylesheet is deliberately NOT reset between
 * cases: it is installed once per document, and proving that a second PAPI does
 * not add a second copy is one of the things worth asserting.
 */
let api: LynxElementApi
let page: LynxElement
let owner: number

/**
 * The registry the engine would call back into.
 *
 * `__AddEvent` will not take a closure — a device engine accepts one and then
 * never invokes it — so a listener is a token, and dispatch goes through a
 * global `runWorklet` that resolves it. The runtime installs its own; this is a
 * miniature of the same thing, which keeps the test honest about the path a
 * real event takes.
 */
const dispatchers = new Map<number, (event: unknown) => void>()
let nextToken = 1

type Worklet = { type: 'worklet'; value: unknown }

const worklet = (handler: (event: unknown) => void): Worklet => {
  const id = nextToken++
  dispatchers.set(id, handler)
  return { type: 'worklet', value: { id } }
}

/** A listener that records that it ran, which is what the ordering cases need. */
const records = (into: string[], label: string): Worklet => worklet(() => into.push(label))

/** The DOM node behind an opaque engine handle, which only a test may look at. */
const node = (element: LynxElement | undefined): HTMLElement => element as unknown as HTMLElement

beforeEach(() => {
  dispatchers.clear()
  ;(globalThis as { runWorklet?: unknown }).runWorklet = (value: unknown, args: unknown[]) => {
    dispatchers.get((value as { id: number }).id)?.(args[0])
  }

  const root = document.createElement('div')
  document.body.append(root)
  api = createDomPapi({ root })
  page = api.__GetPageElement?.() as LynxElement
  owner = api.__GetElementUniqueID?.(page) ?? 0
})

/** Creates an element and attaches it, which is all most of these cases need. */
const child = (tag: string, parent: LynxElement = page): LynxElement => {
  const element = api.__CreateElement(tag, owner, {})
  api.__AppendElement(parent, element)
  return element
}

describe('dom-papi', () => {
  it('creates elements under their Lynx tag names', () => {
    expect(node(api.__CreateElement('view', owner, {})).localName).toBe('view')
    expect(node(api.__CreateView?.(owner)).localName).toBe('view')
    expect(node(api.__CreateText?.(owner)).localName).toBe('text')
    expect(node(api.__CreateImage?.(owner)).localName).toBe('image')
    expect(node(api.__CreateScrollView?.(owner)).localName).toBe('scroll-view')
    expect(node(api.__CreateWrapperElement(owner)).localName).toBe('wrapper')
    expect(node(api.__CreateRawText('hi')).localName).toBe('raw-text')
  })

  it('hands out unique ids above zero', () => {
    // Zero is out of range on a real engine, and code that treats it as "no
    // element" silently loses selector resolution — so the preview must not be
    // able to hide that mistake either.
    expect(owner).toBeGreaterThanOrEqual(10)
    expect(api.__GetElementUniqueID?.(child('view'))).not.toBe(owner)
  })

  it('applies the layout reset inside the app root', () => {
    const view = child('view')
    const wrapper = child('wrapper')
    const text = child('text')
    const run = api.__CreateRawText('hello')
    api.__AppendElement(text, run)

    const style = getComputedStyle(node(view))
    // Linear, approximated: a container stacks its children down the page.
    expect(style.display).toBe('flex')
    expect(style.flexDirection).toBe('column')
    // The three Lynx defaults a browser gets wrong in silence.
    expect(style.position).toBe('relative')
    expect(style.overflow).toBe('hidden')
    expect(style.boxSizing).toBe('border-box')

    // A wrapper holds children without taking part in layout.
    expect(getComputedStyle(node(wrapper)).display).toBe('contents')
    // Text flows as text rather than as a linear container.
    expect(getComputedStyle(node(text)).display).toBe('block')
    expect(getComputedStyle(node(run)).display).toBe('inline')
  })

  it('installs the reset once per document', () => {
    createDomPapi({ root: document.body })
    expect(document.querySelectorAll('#lynx-preview-reset')).toHaveLength(1)
  })

  it('stops text inheriting through a container', () => {
    // `enableCSSInheritance` is off by default, so a colour on a container does
    // NOT reach a nested <text> on a device. A browser would inherit it, and a
    // preview that did too would hide the difference until the app shipped.
    const container = child('view')
    const text = child('text', container)
    // The base the reset re-asserts is a custom property, which is also how an
    // app changes it — and custom properties DO inherit in Lynx, so this is a
    // portable way to say it.
    api.__AddInlineStyle(page, '--lynx-color', 'rgb(1, 2, 3)')
    api.__SetInlineStyles(container, { color: 'rgb(255, 0, 0)' })

    expect(getComputedStyle(node(container)).color).toBe('rgb(255, 0, 0)')
    expect(getComputedStyle(node(text)).color).toBe('rgb(1, 2, 3)')
  })

  it('lets a bind listener bubble and a catch listener stop it', () => {
    const outer = child('view')
    const inner = child('view', outer)
    const fired: string[] = []

    api.__AddEvent(outer, 'bindEvent', 'tap', records(fired, 'outer'))
    api.__AddEvent(inner, 'bindEvent', 'tap', records(fired, 'inner'))
    node(inner).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(fired).toEqual(['inner', 'outer'])

    fired.length = 0
    api.__AddEvent(inner, 'bindEvent', 'tap', null)
    api.__AddEvent(inner, 'catchEvent', 'tap', records(fired, 'inner'))
    node(inner).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(fired).toEqual(['inner'])
  })

  it('fires a capture-bind listener before a child bind listener', () => {
    const outer = child('view')
    const inner = child('view', outer)
    const fired: string[] = []

    api.__AddEvent(outer, 'capture-bind', 'tap', records(fired, 'outer'))
    api.__AddEvent(inner, 'bindEvent', 'tap', records(fired, 'inner'))
    node(inner).dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(fired).toEqual(['outer', 'inner'])
  })

  it('keeps one listener per type and name, overwriting the previous one', () => {
    // The engine's real constraint, reproduced rather than smoothed over: the
    // runtime's fan-out layer exists because of it, and a permissive fake would
    // make that layer untestable.
    const view = child('view')
    const fired: string[] = []

    api.__AddEvent(view, 'bindEvent', 'tap', records(fired, 'first'))
    api.__AddEvent(view, 'bindEvent', 'tap', records(fired, 'second'))
    node(view).dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(fired).toEqual(['second'])
  })

  it('removes a listener when it is passed null', () => {
    const view = child('view')
    const fired: string[] = []

    api.__AddEvent(view, 'bindEvent', 'tap', records(fired, 'tap'))
    api.__AddEvent(view, 'bindEvent', 'tap', null)
    node(view).dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(fired).toEqual([])
  })

  it('refuses a function listener', () => {
    // A device engine stores a closure and then never calls it, so the mistake
    // is invisible there. Failing loudly here is the whole point of a preview.
    const view = child('view')
    const listener = () => {}

    expect(() => api.__AddEvent(view, 'bindEvent', 'tap', listener as unknown as null)).toThrow(TypeError)
  })

  it('gives a tap the payload a Lynx handler expects', () => {
    const view = child('view')
    let received: { detail?: { x?: number }; currentTarget?: { uid?: number } } | undefined
    api.__AddEvent(
      view,
      'bindEvent',
      'tap',
      worklet((event) => {
        received = event as typeof received
      }),
    )

    node(view).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 12, clientY: 34 }))

    expect(received?.detail?.x).toBe(12)
    expect(received?.currentTarget?.uid).toBe(api.__GetElementUniqueID?.(view))
  })

  it('only treats Enter as a confirm', () => {
    const input = child('input')
    const fired: string[] = []
    api.__AddEvent(input, 'bindEvent', 'confirm', records(fired, 'confirm'))

    node(input).dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    node(input).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(fired).toEqual(['confirm'])
  })

  it('drives a raw-text from its text attribute', () => {
    // A string is an element in Lynx, and updating it writes one attribute
    // rather than replacing a node — so the rendered text has to follow it.
    const run = api.__CreateRawText('before')
    api.__AppendElement(page, run)
    expect(node(run).textContent).toBe('before')

    api.__SetAttribute(run, 'text', 'after')
    expect(node(run).getAttribute('text')).toBe('after')
    expect(node(run).textContent).toBe('after')
  })

  it('maps an image mode onto object-fit', () => {
    const image = child('image')

    api.__SetAttribute(image, 'mode', 'aspectFill')
    expect(node(image).style.objectFit).toBe('cover')

    api.__SetAttribute(image, 'mode', 'aspectFit')
    expect(node(image).style.objectFit).toBe('contain')

    api.__SetAttribute(image, 'mode', 'center')
    expect(node(image).style.objectFit).toBe('none')

    // The Lynx spelling stays on the element, so the inspector shows the tree a
    // device would rather than the CSS this preview derived from it.
    expect(node(image).getAttribute('mode')).toBe('center')
  })

  it('keeps a preview declaration across a style write', () => {
    // `__SetInlineStyles` replaces the inline style wholesale, so without the
    // re-assert an app writing a `style` prop after its `mode` would silently
    // lose the fit.
    const image = child('image')
    api.__SetAttribute(image, 'mode', 'aspectFill')
    api.__SetInlineStyles(image, { width: '100px' })

    expect(node(image).style.width).toBe('100px')
    expect(node(image).style.objectFit).toBe('cover')
  })
})
