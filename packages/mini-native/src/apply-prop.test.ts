import { afterEach, describe, expect, it } from 'vitest'

import { applyProp } from './apply-prop'
import { clearEngine, setEngine } from './engine/current-engine'
import type { LynxElement } from './engine/element-api'
import { clearWorklets } from './events/worklet-registry'
import { signal } from './signals'
import { createFakeEngine, type FakeElement, type FakeEngine } from './testing/create-fake-engine'
import { createElement } from './tree'

/**
 * `applyProp` is where the compilerless reactivity rule actually lives — a
 * function-valued prop tracks, anything else is applied once — and where Lynx's
 * own prop spellings are honoured rather than translated.
 *
 * Each prop kind makes the static-or-reactive decision for itself, so each is
 * pinned separately: a regression in any single branch would otherwise hide
 * behind the others.
 */

const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

/** The in-memory node behind an opaque handle. */
const fake = (element: LynxElement): FakeElement => element as unknown as FakeElement

/** Installs a fresh engine and hands back an element to apply props to. */
const setup = (): { engine: FakeEngine; view: LynxElement } => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  const view = createElement('view')
  engine.clearCalls()
  return { engine, view }
}

/** The `(type, name)` pairs the engine currently holds a listener for. */
const boundEvents = (view: LynxElement): string[] => [...fake(view).events.keys()]

afterEach(async () => {
  await tick()
  clearEngine()
  clearWorklets()
})

describe('apply-prop', () => {
  it('passes an attribute through with the engine own spelling', () => {
    // No translation table, deliberately. The engine's documentation is this
    // runtime's documentation, and there is no second spelling for a prop to be
    // lost between.
    const { engine, view } = setup()

    applyProp(view, 'text-maxline', '2')
    applyProp(view, 'scroll-orientation', 'horizontal')

    expect(fake(view).attrs).toEqual({ 'text-maxline': '2', 'scroll-orientation': 'horizontal' })
    expect(engine.calls()).toContain(`__SetAttribute(#${fake(view).id}, "text-maxline", "2")`)
  })

  it('applies a static attribute once and never again', () => {
    // Calling the signal reads it once, which is the compilerless footgun. The
    // attribute must freeze at whatever that read produced.
    const { view } = setup()
    const placeholder = signal('before')

    applyProp(view, 'placeholder', placeholder())
    placeholder('after')

    expect(fake(view).attrs['placeholder']).toBe('before')
  })

  it('tracks a getter-valued attribute', () => {
    const { view } = setup()
    const placeholder = signal('before')

    applyProp(view, 'placeholder', placeholder)
    placeholder('after')

    expect(fake(view).attrs['placeholder']).toBe('after')
  })

  it('keeps false, which is a value on Lynx rather than an absence', () => {
    // The web habit is the opposite: `disabled={false}` means "no attribute",
    // because an HTML boolean attribute is true by its presence. Lynx is not
    // HTML — `flatten`, `accessibility-element` and `accessibility-disabled`
    // default to something other than false, so a stated `false` is an opt-out
    // and swallowing it leaves the element doing the opposite of the source.
    const { engine, view } = setup()

    applyProp(view, 'flatten', false)

    expect(fake(view).attrs['flatten']).toBe(false)
    expect(engine.calls()).toContain(`__SetAttribute(#${fake(view).id}, "flatten", false)`)
  })

  it('clears an attribute when the value is null or undefined', () => {
    const { view } = setup()

    applyProp(view, 'from-null', null)
    applyProp(view, 'from-undefined', undefined)

    expect(fake(view).attrs).toEqual({})
  })

  it('tracks a boolean all the way to false rather than dropping the attribute', () => {
    const { view } = setup()
    const flattened = signal(true)

    applyProp(view, 'flatten', flattened)
    expect(fake(view).attrs['flatten']).toBe(true)

    flattened(false)

    expect(fake(view).attrs['flatten']).toBe(false)
  })

  it('clears an attribute when a tracked value turns nullish', () => {
    const { view } = setup()
    const label = signal<string | null>('Save')

    applyProp(view, 'accessibility-label', label)
    expect(fake(view).attrs['accessibility-label']).toBe('Save')

    label(null)

    expect('accessibility-label' in fake(view).attrs).toBe(false)
  })

  it('keeps zero and the empty string, which are values rather than absences', () => {
    const { view } = setup()

    applyProp(view, 'item-key', '')
    applyProp(view, 'span-count', 0)

    expect(fake(view).attrs).toEqual({ 'item-key': '', 'span-count': 0 })
  })

  it('resolves the string, array and toggle-map forms of class', () => {
    const { view } = setup()

    applyProp(view, 'class', 'card')
    expect(fake(view).classes).toBe('card')

    applyProp(view, 'class', ['card', false, 'wide', ['nested', null]])
    expect(fake(view).classes).toBe('card wide nested')

    applyProp(view, 'class', { card: true, on: false, wide: true })
    expect(fake(view).classes).toBe('card wide')
  })

  it('tracks a class getter and re-resolves every form', () => {
    const { view } = setup()
    const active = signal(false)

    applyProp(view, 'class', () => ({ card: true, on: active() }))
    expect(fake(view).classes).toBe('card')

    active(true)

    expect(fake(view).classes).toBe('card on')
  })

  it('sends id through __SetID and not through __SetAttribute', () => {
    // `id` is what an id selector and a `SelectorQuery` match on, and it has its
    // own PAPI call. Written as an attribute it would be inert.
    const { engine, view } = setup()

    applyProp(view, 'id', 'header')

    expect(fake(view).elementId).toBe('header')
    expect('id' in fake(view).attrs).toBe(false)
    expect(engine.calls()).toEqual([`__SetID(#${fake(view).id}, "header")`])
  })

  it('clears the id when the value goes away', () => {
    const { view } = setup()
    const id = signal<string | null>('header')

    applyProp(view, 'id', id)
    id(null)

    expect(fake(view).elementId).toBeNull()
  })

  it('accepts a style bag, a getter and a CSS string', () => {
    const { engine, view } = setup()
    const width = signal(10)

    applyProp(view, 'style', { fontSize: 12 })
    expect(fake(view).styles).toEqual({ 'font-size': '12px' })

    applyProp(view, 'style', () => ({ width: width() }))
    expect(fake(view).styles).toEqual({ width: '10px' })
    width(20)
    expect(fake(view).styles).toEqual({ width: '20px' })

    applyProp(view, 'style', 'top:10px;left:10px')
    // CSS text is handed straight to the engine, which already parses it; the
    // fake does not re-parse, so the declarations map goes empty.
    expect(engine.calls()).toContain(`__SetInlineStyles(#${fake(view).id}, "top:10px;left:10px")`)
  })

  it('clears the style when the value is nullish', () => {
    const { view } = setup()
    applyProp(view, 'style', { width: 10 })

    applyProp(view, 'style', undefined)

    expect(fake(view).styles).toEqual({})
  })

  it('applies a static show once', () => {
    // A plain boolean still goes through the visibility binding, so the two
    // forms of `show` cannot drift apart in behaviour.
    const { view } = setup()

    applyProp(view, 'show', false)

    expect(fake(view).styles['display']).toBe('none')
  })

  it('tracks a show getter', () => {
    const { view } = setup()
    const visible = signal(true)

    applyProp(view, 'show', visible)
    visible(false)

    expect(fake(view).styles['display']).toBe('none')
  })

  it('registers bindtap as a bubble-phase listener', () => {
    const { engine, view } = setup()
    const taps: number[] = []

    applyProp(view, 'bindtap', () => taps.push(1))

    expect(boundEvents(view)).toEqual(['bindEvent:tap'])
    engine.dispatch(fake(view), 'tap')
    expect(taps).toHaveLength(1)
  })

  it('registers catchtap as a bubble-phase listener that stops propagation', () => {
    const { engine, view } = setup()
    const taps: number[] = []

    applyProp(view, 'catchtap', () => taps.push(1))

    expect(boundEvents(view)).toEqual(['catchEvent:tap'])
    engine.dispatch(fake(view), 'tap', {}, 'catchEvent')
    expect(taps).toHaveLength(1)
  })

  it('registers capture-bindtap under the capture prefix, not under bind', () => {
    // The ordering trap, and the reason the prefix table is sorted longest
    // first. `capture-bindtap` contains `bind`, so a table that tested the short
    // prefixes first would split it after `capture-` and hand the engine a
    // bubble-phase listener for an event named `capture-tap` — which nothing
    // emits. The handler would never fire and nothing would say why.
    const { engine, view } = setup()
    const taps: number[] = []

    applyProp(view, 'capture-bindtap', () => taps.push(1))

    expect(boundEvents(view)).toEqual(['capture-bind:tap'])
    expect(boundEvents(view)).not.toContain('bindEvent:capture-tap')
    engine.dispatch(fake(view), 'tap', {}, 'capture-bind')
    expect(taps).toHaveLength(1)
  })

  it('registers capture-catchtap under the capture prefix, not under catch', () => {
    const { engine, view } = setup()
    const taps: number[] = []

    applyProp(view, 'capture-catchtap', () => taps.push(1))

    expect(boundEvents(view)).toEqual(['capture-catch:tap'])
    expect(boundEvents(view)).not.toContain('catchEvent:capture-tap')
    engine.dispatch(fake(view), 'tap', {}, 'capture-catch')
    expect(taps).toHaveLength(1)
  })

  it('keeps the irregular Event suffix exactly as the engine string-compares it', () => {
    // `bind`, `catch` and `global-bind` gain the suffix; the two capture forms
    // do not. Tidying that up would produce a type the engine does not
    // recognise and a listener that never fires.
    const { view } = setup()

    applyProp(view, 'bindtap', () => {})
    applyProp(view, 'catchtap', () => {})
    applyProp(view, 'global-bindtap', () => {})
    applyProp(view, 'capture-bindtap', () => {})
    applyProp(view, 'capture-catchtap', () => {})

    expect(boundEvents(view).sort()).toEqual([
      'bindEvent:tap',
      'capture-bind:tap',
      'capture-catch:tap',
      'catchEvent:tap',
      'global-bindEvent:tap',
    ])
  })

  it('treats main-thread:bindtap as exactly the same listener as bindtap', () => {
    // This runtime already runs on the main thread, so the prefix is accepted
    // and dropped — a component pasted out of a Lynx codebase keeps working
    // instead of silently losing its handler.
    const { engine, view } = setup()
    const taps: string[] = []

    applyProp(view, 'main-thread:bindtap', () => taps.push('main-thread'))
    applyProp(view, 'bindtap', () => taps.push('plain'))

    expect(boundEvents(view)).toEqual(['bindEvent:tap'])
    engine.dispatch(fake(view), 'tap')
    expect(taps).toEqual(['main-thread', 'plain'])
  })

  it('strips main-thread: before the prefix table rather than after', () => {
    const { view } = setup()

    applyProp(view, 'main-thread:capture-bindtap', () => {})

    expect(boundEvents(view)).toEqual(['capture-bind:tap'])
  })

  it('leaves an event-shaped prop that is not a function on the attribute path', () => {
    // The value check is what keeps `bindtap={undefined}` from registering a
    // listener for a handler that does not exist. Anything non-callable is an
    // ordinary attribute instead, so nothing is silently swallowed.
    const { view } = setup()

    applyProp(view, 'bindtap', 'handlerName')

    expect(boundEvents(view)).toEqual([])
    expect(fake(view).attrs['bindtap']).toBe('handlerName')
  })

  it('registers nothing for an event prop that is undefined', () => {
    const { view } = setup()

    applyProp(view, 'bindtap', undefined)

    expect(boundEvents(view)).toEqual([])
    expect('bindtap' in fake(view).attrs).toBe(false)
  })

  it('treats a bare prefix with nothing after it as an ordinary attribute', () => {
    // `name.length > prefix.length` is what stops `bind` on its own from being
    // read as a listener for the empty event name.
    const { view } = setup()

    applyProp(view, 'bind', 'value')

    expect(boundEvents(view)).toEqual([])
    expect(fake(view).attrs['bind']).toBe('value')
  })

  it('schedules a commit for every prop it applies', async () => {
    const { engine, view } = setup()

    applyProp(view, 'class', 'card')

    expect(engine.flushes()).toBe(0)
    await tick()
    expect(engine.flushes()).toBe(1)
  })
})
