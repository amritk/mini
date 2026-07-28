import type { ImageProps, ListItemProps, ViewProps } from '@lynx-js/types'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { applyProp } from '../apply-prop'
import { setEngine } from '../engine/current-engine'
import { createFakeEngine } from '../testing/create-fake-engine'
import { createElement, insert } from '../tree'
import type { LynxElement } from '../types'
import type { IntrinsicElements } from './intrinsic'

/**
 * Most of this suite is checked by the COMPILER rather than by the runner:
 * `expectTypeOf` and `@ts-expect-error` do nothing at execution time, and
 * `bun run --filter='@amritk/mini-lynx' types:check` is what actually fails
 * when the vocabulary drifts. The `expect` calls are there so each case is a
 * real test the runner reports on, and so `noUnusedLocals` does not delete the
 * bindings the type assertions are about.
 *
 * A vocabulary is exactly the sort of thing worth pinning this way. It has no
 * behaviour to assert on — it is a hundred percent type — and the failures it
 * exists to prevent are silent ones: a prop the engine ignores, a bare string
 * inside a container that renders a blank screen on a device.
 */
describe('intrinsic', () => {
  it('accepts either a static value or a getter for a plain attribute', () => {
    const staticValue: IntrinsicElements['image'] = { src: 'logo.png' }
    const getter: IntrinsicElements['image'] = { src: () => 'logo.png' }

    // Both arms, and nothing else. Spelling the union out rather than asserting
    // assignability is what pins the SHAPE: a `MaybeReactive` that had lost its
    // getter arm would still accept the first line above.
    expectTypeOf<IntrinsicElements['image']['src']>().toEqualTypeOf<string | (() => string) | undefined>()

    expect([staticValue.src, typeof getter.src]).toEqual(['logo.png', 'function'])
  })

  it('leaves an event prop as the handler Lynx declares, with no getter arm', () => {
    const handler: IntrinsicElements['view'] = { bindtap: (event) => event.detail.x }

    // The prop comes through from `@lynx-js/types` untouched — no `MaybeReactive`
    // wrapper — which is the carve-out `EventKey` exists for.
    expectTypeOf<IntrinsicElements['view']['bindtap']>().toEqualTypeOf<ViewProps['bindtap']>()

    // Worth knowing why this is asserted by identity rather than by a rejected
    // getter: TypeScript treats a `void` return as accepting any return, and a
    // zero-argument function as satisfying any parameter list, so `() => handler`
    // is STRUCTURALLY a valid handler and no `@ts-expect-error` could catch it.
    // The wrapper's absence is therefore the only thing that can be tested, and
    // it is the thing that matters — it is what makes `bindtap={fn}` unambiguous
    // at runtime, where `apply-prop` decides reactive-versus-static by asking
    // whether the value is a function.
    expect(typeof handler.bindtap).toBe('function')
  })

  it('checks an event handler against the payload the engine sends', () => {
    const props: IntrinsicElements['scroll-view'] = {
      // @ts-expect-error — `bindscroll` carries Lynx's scroll info, not an arbitrary shape
      bindscroll: (event: { nope: string }) => event.nope,
    }

    expect(typeof props.bindscroll).toBe('function')
  })

  it('rejects children on a leaf element', () => {
    const props: IntrinsicElements['image'] = {
      src: 'logo.png',
      // @ts-expect-error — `image` is an empty element; children would build a subtree the engine drops
      children: 'caption',
    }

    expect(props.src).toBe('logo.png')
  })

  it('rejects a bare string inside a container', () => {
    // The whole reason `ContainerChildren` leaves strings out. Lynx has no loose
    // text inside a container — a run of text is a `raw-text` element that may
    // only live in a `<text>` — so this builds a tree the engine will not render
    // and the screen comes up blank with no error anywhere.
    // @ts-expect-error — a bare string is not a legal child of a container
    const props: IntrinsicElements['view'] = { children: 'hello' }

    expect(props.children).toBe('hello')
  })

  it('accepts a bare string, a number and a getter inside text', () => {
    const literal: IntrinsicElements['text'] = { children: 'hello' }
    const count: IntrinsicElements['text'] = { children: 42 }
    const reactive: IntrinsicElements['text'] = { children: () => 'hello' }

    expect([literal.children, count.children, typeof reactive.children]).toEqual(['hello', 42, 'function'])
  })

  it('accepts a style bag, a getter and a CSS string', () => {
    // The bag is the interesting arm: a bare number means density-independent
    // pixels and the runtime appends the unit, which is exactly what the
    // package's own `string | CSSProperties` cannot express.
    const bag: IntrinsicElements['view'] = { style: { width: 100, 'font-size': '12px' } }
    const getter: IntrinsicElements['view'] = { style: () => ({ opacity: 0.5 }) }
    const css: IntrinsicElements['view'] = { style: 'top:10px;left:10px' }

    expect([typeof bag.style, typeof getter.style, css.style]).toEqual(['object', 'function', 'top:10px;left:10px'])
  })

  it('accepts a class as a string, an array or a toggle map', () => {
    const plain: IntrinsicElements['view'] = { class: 'card' }
    const list: IntrinsicElements['view'] = { class: ['card', false && 'active'] }
    const toggles: IntrinsicElements['view'] = { class: { card: true, active: false } }

    expect([plain.class, Array.isArray(list.class), typeof toggles.class]).toEqual(['card', true, 'object'])
  })

  it('rejects a misspelled attribute', () => {
    const props: IntrinsicElements['image'] = {
      // @ts-expect-error — `srcc` is not an attribute the engine reads
      srcc: 'logo.png',
    }

    expect(props).toBeDefined()
  })

  it('rejects className, which has no compiler here to resolve it', () => {
    const props: IntrinsicElements['view'] = {
      // @ts-expect-error — `className` is ReactLynx's compile-time alias for `class`
      className: 'card',
    }

    expect(props).toBeDefined()
  })

  it('keeps a prop Lynx marks required required', () => {
    // The mapped type is homomorphic on purpose. Re-marking everything optional
    // would have thrown this away, and a `list-item` with no `item-key` is a
    // list that recycles the wrong row — a bug that looks like corrupted data.
    // @ts-expect-error — `item-key` is required on `list-item`
    const missing: IntrinsicElements['list-item'] = {}
    const present: IntrinsicElements['list-item'] = { 'item-key': 'row-1' }

    expectTypeOf<IntrinsicElements['list-item']>().toHaveProperty('item-key')
    expectTypeOf<ListItemProps['item-key']>().toEqualTypeOf<string>()

    expect([missing, present['item-key']]).toEqual([{}, 'row-1'])
  })

  it('adds ref, show and key to every tag', () => {
    const seen: string[] = []
    const props: IntrinsicElements['scroll-view'] = {
      key: 'ignored-at-runtime',
      show: () => true,
      ref: (element) => seen.push(typeof element),
      'scroll-orientation': 'horizontal',
    }

    expectTypeOf<IntrinsicElements['view']['ref']>().toEqualTypeOf<((element: LynxElement) => void) | undefined>()

    props.ref?.({} as LynxElement)
    expect(seen).toEqual(['object'])
  })

  it('gives the hand-written wrapper no style, class or show', () => {
    // A wrapper takes part in neither layout nor the accessibility tree, so
    // there is nothing for any of the three to act on. Offering them would only
    // invite someone to style the one element that cannot be styled.
    const props: IntrinsicElements['wrapper'] = {
      // @ts-expect-error — a wrapper has no box to style
      style: { width: 10 },
    }

    expect(props).toBeDefined()
  })

  it('still offers a tag added after the peer floor', () => {
    // `video` arrived in @lynx-js/types 4.1.0 and the declared peer floor is
    // 4.0.0, so on an older install the tag resolves to the global attributes
    // rather than failing to compile. Either way it exists and takes no children.
    const props: IntrinsicElements['video'] = { id: 'clip' }

    expect(props.id).toBe('clip')
  })

  it('adds nothing at all to the runtime', async () => {
    // The optional peer is types-only, and so is this module. If a value ever
    // appears here an app pays for the vocabulary in bytes, which is the one
    // cost deriving from `@lynx-js/types` was supposed to avoid entirely.
    const vocabulary = await import('./index')

    expect(Object.keys(vocabulary)).toEqual([])
  })

  it('reaches the engine with the spelling the vocabulary declares', () => {
    // The payoff of deriving from the engine's own types: there is no
    // translation table, so an attribute arrives named exactly as it was
    // written and an event splits into the engine's `(type, name)` pair.
    const engine = createFakeEngine()
    setEngine(engine.api)

    const element = createElement('text')
    insert(engine.pageElement, element, null)
    applyProp(element, 'text-maxline', '2' satisfies NonNullable<IntrinsicElements['text']['text-maxline']>)
    applyProp(element, 'bindtap', () => {})

    const built = engine.find('text')
    expect(built?.attrs['text-maxline']).toBe('2')
    expect([...(built?.events.keys() ?? [])]).toEqual(['bindEvent:tap'])
  })

  it('binds a getter-valued attribute reactively and a static one once', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    const element = createElement('image')
    insert(engine.pageElement, element, null)
    // `ImageProps['mode']` is a union of four strings; passing the getter arm is
    // what a signal looks like at a call site, and it has to land as the value.
    applyProp(element, 'mode', (() => 'aspectFit') satisfies NonNullable<IntrinsicElements['image']['mode']>)
    applyProp(element, 'src', 'logo.png' satisfies NonNullable<ImageProps['src']>)

    const built = engine.find('image')
    expect([built?.attrs['mode'], built?.attrs['src']]).toEqual(['aspectFit', 'logo.png'])
  })
})
