import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { createFakeEngine, type FakeElement, type FakeEngine } from '../testing/create-fake-engine'
import { createElement } from '../tree'
import { applyStyle, applyVisible } from './apply-style'

/**
 * Two jobs, and the second is the reason this file exists at all.
 *
 * The conversions — CSS spellings and units — are the easy half, and they are
 * silent when skipped: an unrecognised declaration is dropped by the engine
 * rather than reported.
 *
 * The hard half is that Lynx expresses an element's style bag and its visibility
 * through ONE channel, and `__SetInlineStyles` replaces that channel wholesale.
 * A style write on a hidden element therefore un-hides it — and whether it does
 * depends on the order the props happened to be written in, which makes it an
 * intermittent bug rather than a reproducible one.
 */

const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

/** The in-memory node behind an opaque handle. */
const fake = (element: LynxElement): FakeElement => element as unknown as FakeElement

/** Installs a fresh engine and hands back an element to style. */
const setup = (): { engine: FakeEngine; view: LynxElement } => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  const view = createElement('view')
  engine.clearCalls()
  return { engine, view }
}

/** The inline declarations the engine currently holds. */
const declarations = (view: LynxElement): Record<string, string> => fake(view).styles

afterEach(async () => {
  await tick()
  clearEngine()
})

describe('apply-style', () => {
  it('spells camelCase keys the way CSS does', () => {
    // `__SetInlineStyles` is handed declarations the engine parses as CSS, where
    // `fontSize` has never been a property.
    const { view } = setup()

    applyStyle(view, { fontSize: 12, backgroundColor: 'red' })

    expect(declarations(view)).toEqual({ 'font-size': '12px', 'background-color': 'red' })
  })

  it('leaves kebab-case keys alone', () => {
    // Both spellings are the same property everywhere in this package, so a bag
    // written either way has to arrive identically.
    const { view } = setup()

    applyStyle(view, { 'font-size': 12, 'background-color': 'red' })

    expect(declarations(view)).toEqual({ 'font-size': '12px', 'background-color': 'red' })
  })

  it('adds px to a bare number', () => {
    // A bare number means density-independent pixels, the convention every
    // native toolkit shares. Passed through raw it would be an invalid
    // declaration the engine silently discards.
    const { view } = setup()

    applyStyle(view, { width: 100, marginTop: 8 })

    expect(declarations(view)).toEqual({ width: '100px', 'margin-top': '8px' })
  })

  it('leaves the unitless properties unitless', () => {
    const { view } = setup()

    applyStyle(view, { opacity: 0.5, zIndex: 3, flexGrow: 1, fontWeight: 600 })

    expect(declarations(view)).toEqual({ opacity: '0.5', 'z-index': '3', 'flex-grow': '1', 'font-weight': '600' })
  })

  it('passes a string value through with whatever unit it carries', () => {
    const { view } = setup()

    applyStyle(view, { width: '50%', padding: '2rem' })

    expect(declarations(view)).toEqual({ width: '50%', padding: '2rem' })
  })

  it('does not case-fold a custom property', () => {
    // A custom property is whatever its author says it is. Lower-casing
    // `--brandColor` would produce a name nothing declared, and guessing a unit
    // for its value would be equally presumptuous.
    const { view } = setup()

    applyStyle(view, { '--brand': 'red', '--brandColor': 'blue', '--gutter': 8 })

    expect(declarations(view)).toEqual({ '--brand': 'red', '--brandColor': 'blue', '--gutter': '8' })
  })

  it('drops the entries that mean unset', () => {
    const { view } = setup()

    applyStyle(view, { width: 10, height: null, margin: undefined, padding: false })

    expect(declarations(view)).toEqual({ width: '10px' })
  })

  it('replaces the whole bag on every write', () => {
    // `__SetInlineStyles` is a wholesale replacement, which is exactly why the
    // visibility rule below has to exist.
    const { view } = setup()
    applyStyle(view, { width: 10, height: 20 })

    applyStyle(view, { width: 30 })

    expect(declarations(view)).toEqual({ width: '30px' })
  })

  it('clears the style when handed null', () => {
    const { view } = setup()
    applyStyle(view, { width: 10 })

    applyStyle(view, null)

    expect(declarations(view)).toEqual({})
  })

  it('hands a CSS string to the engine untouched', () => {
    // It is already declarations, and re-parsing it here to find a `display`
    // would mean shipping a CSS parser to serve a case the object form covers
    // better.
    const { engine, view } = setup()

    applyStyle(view, 'top:10px;left:10px')

    expect(engine.calls()).toContain(`__SetInlineStyles(#${fake(view).id}, "top:10px;left:10px")`)
  })

  it('keeps an element hidden across a style write', () => {
    // THE invariant. Sharing one channel between visibility and the style bag
    // means a later style update quietly un-hides a hidden element, and whether
    // it does depends on prop order — so it fails intermittently, which is the
    // worst shape a bug can have.
    const { view } = setup()

    applyVisible(view, false)
    applyStyle(view, { width: 10, backgroundColor: 'red' })

    expect(declarations(view)['display']).toBe('none')
    expect(declarations(view)['width']).toBe('10px')
  })

  it('keeps an element hidden across a CSS-string style write', () => {
    const { view } = setup()

    applyVisible(view, false)
    applyStyle(view, 'width:10px')

    expect(declarations(view)['display']).toBe('none')
  })

  it('keeps an element hidden when the style is written first', () => {
    // The other order, because order is precisely what made the original bug
    // intermittent.
    const { view } = setup()

    applyStyle(view, { width: 10 })
    applyVisible(view, false)
    applyStyle(view, { width: 20 })

    expect(declarations(view)['display']).toBe('none')
  })

  it('restores the display the element own bag asked for when shown again', () => {
    const { view } = setup()

    applyStyle(view, { display: 'linear' })
    applyVisible(view, false)
    expect(declarations(view)['display']).toBe('none')

    applyVisible(view, true)

    expect(declarations(view)['display']).toBe('linear')
  })

  it('follows the bag when the display it asks for changes while hidden', () => {
    const { view } = setup()

    applyVisible(view, false)
    applyStyle(view, { display: 'linear' })
    expect(declarations(view)['display']).toBe('none')

    applyVisible(view, true)

    expect(declarations(view)['display']).toBe('linear')
  })

  it('leaves no display at all when the element own bag never asked for one', () => {
    // Deliberately not a constant. Lynx's default display is `linear` rather
    // than `flex` and is configurable per page, so any value picked here would
    // be wrong for somebody — and wrong in the quiet way where the element
    // appears but lays its children out along the other axis.
    const { view } = setup()

    applyVisible(view, false)
    applyVisible(view, true)

    expect('display' in declarations(view)).toBe(false)
  })

  it('forgets a display that a later bag stopped asking for', () => {
    const { view } = setup()
    applyStyle(view, { display: 'linear' })

    applyStyle(view, { width: 10 })
    applyVisible(view, false)
    applyVisible(view, true)

    expect('display' in declarations(view)).toBe(false)
    expect(declarations(view)['width']).toBe('10px')
  })

  it('re-applies the whole bag when the element is shown again', () => {
    // Showing does not just drop `display: none` — it rewrites the bag, which is
    // what lets the element land back on its own `display` without this file
    // having to know what the engine's default is.
    const { view } = setup()
    applyStyle(view, { width: 10, backgroundColor: 'red' })

    applyVisible(view, false)
    applyVisible(view, true)

    expect(declarations(view)).toEqual({ width: '10px', 'background-color': 'red' })
  })

  it('keeps a CSS-string style alive across hide and show', () => {
    // A regression guard for a real bug: the string form used to leave
    // `state.style` as null, so showing the element re-applied that null as an
    // EMPTY bag and `__SetInlineStyles` wiped the styling wholesale. The
    // element came back unstyled, on a device, only after being hidden once.
    const { engine, view } = setup()
    applyStyle(view, 'width:10px')
    applyVisible(view, false)
    engine.clearCalls()

    applyVisible(view, true)

    expect(engine.calls()).not.toContain(`__SetInlineStyles(#${fake(view).id}, {})`)
  })

  it('remembers visibility per element rather than globally', () => {
    const { view } = setup()
    const other = createElement('view')

    applyVisible(view, false)
    applyStyle(other, { width: 10 })

    expect(declarations(other)['display']).toBeUndefined()
    expect(declarations(view)['display']).toBe('none')
  })

  it('schedules a commit for both writes', async () => {
    const { engine, view } = setup()

    applyStyle(view, { width: 10 })
    applyVisible(view, false)

    expect(engine.flushes()).toBe(0)
    await tick()
    expect(engine.flushes()).toBe(1)
  })
})
