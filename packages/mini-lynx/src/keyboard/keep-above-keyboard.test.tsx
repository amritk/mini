import { afterEach, describe, expect, it } from 'vitest'

import type { LynxElement } from '../engine/element-api'
import { clearEngine, mount, setEngine } from '../index'
import { signal } from '../signals'
import { createFakeEngine, type FakeElement, type FakeEngine } from '../testing/create-fake-engine'
import { avoidKeyboard } from './avoid-keyboard'
import { keepAboveKeyboard } from './keep-above-keyboard'
import { setKeyboardHeight } from './keyboard-height'

/**
 * The tree from the case that is running, torn down before the next one.
 *
 * The keyboard height and the focused field are module state — deliberately, a
 * page has one of each — so a case that left its tree mounted would leave its
 * effects reacting to the next case's writes.
 */
let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
  clearEngine()
  setKeyboardHeight(0)
})

/** The same object the runtime holds, spelled the way the runtime spells it. */
const lynx = (element: FakeElement | undefined): LynxElement => element as unknown as LynxElement

/**
 * Lays the screen out for the fake, which lays nothing out on its own.
 *
 * Fields answer by their `id`, and the page answers with the bottom of the
 * screen — the two rects the arithmetic is built from.
 */
const layout = (engine: FakeEngine, bottoms: Record<string, number>, screenBottom = 800): void => {
  engine.onInvoke('boundingClientRect', (element) => {
    if (element.tag === 'page') return { code: 0, data: { bottom: screenBottom } }
    // `id` reaches the engine through `__SetID` rather than as an attribute,
    // which is where the fake keeps it.
    return { code: 0, data: { bottom: bottoms[element.elementId ?? ''] ?? 0 } }
  })
}

/** Long enough for a `boundingClientRect` round trip to resolve and settle. */
const measured = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('keep-above-keyboard', () => {
  it('rises by the overlap rather than by the whole keyboard', async () => {
    // The point of measuring at all: a field 40 below the keys' top edge needs
    // 40, and lifting it by the keyboard's full 300 would move it 260 for
    // nothing — taking the top of the form off the screen with it.
    const engine = createFakeEngine()
    setEngine(engine.api)
    layout(engine, { email: 540 })
    let shift: () => number = () => 0

    dispose = mount(engine.pageElement, () => {
      shift = keepAboveKeyboard()
      return <input id="email" ref={avoidKeyboard} />
    })
    engine.dispatch(engine.find('input') as FakeElement, 'focus')
    setKeyboardHeight(300)
    await measured()

    expect(shift()).toBe(40)
  })

  it('stays at rest for a field the keyboard never reaches', async () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    layout(engine, { email: 220 })
    let shift: () => number = () => 0

    dispose = mount(engine.pageElement, () => {
      shift = keepAboveKeyboard()
      return <input id="email" ref={avoidKeyboard} />
    })
    engine.dispatch(engine.find('input') as FakeElement, 'focus')
    setKeyboardHeight(300)
    await measured()

    expect(shift()).toBe(0)
  })

  it('accounts for the rise already applied when focus moves to another field', async () => {
    // The regression this exists for. The second field is measured WHERE IT
    // CURRENTLY IS — already raised by the first field's shift — so without
    // feeding that back in, a field that now clears the keys reports no overlap
    // and the container drops back to rest under the user's fingers.
    const engine = createFakeEngine()
    setEngine(engine.api)
    // Both sit below the keys before anything moves; once the container has
    // risen 40, the second is measured at 520 rather than at 560.
    layout(engine, { first: 540, second: 520 })
    const field = signal<LynxElement | null>(null)
    let shift: () => number = () => 0

    dispose = mount(engine.pageElement, () => {
      shift = keepAboveKeyboard({ field })
      return (
        <view>
          <input id="first" />
          <input id="second" />
        </view>
      )
    })
    const [first, second] = engine.findAll('input')
    field(lynx(first))
    setKeyboardHeight(300)
    await measured()
    expect(shift()).toBe(40)

    field(lynx(second))
    await measured()

    // The 40 already applied, plus this field's remaining 20 of overlap.
    expect(shift()).toBe(60)
  })

  it('settles back to rest when the keyboard closes', async () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    layout(engine, { email: 540 })
    let shift: () => number = () => 0

    dispose = mount(engine.pageElement, () => {
      shift = keepAboveKeyboard()
      return <input id="email" ref={avoidKeyboard} />
    })
    engine.dispatch(engine.find('input') as FakeElement, 'focus')
    setKeyboardHeight(300)
    await measured()

    setKeyboardHeight(0)

    // Synchronously, with no round trip: a keyboard that is gone covers nothing,
    // and waiting for a measurement to confirm it would hold the screen up for a
    // frame after the keys have already left.
    expect(shift()).toBe(0)
  })

  it('lifts by the whole keyboard when no field has been claimed', async () => {
    // Nothing to measure against, so the only answer that is certainly enough.
    const engine = createFakeEngine()
    setEngine(engine.api)
    layout(engine, {})
    let shift: () => number = () => 0

    dispose = mount(engine.pageElement, () => {
      shift = keepAboveKeyboard()
      return <view />
    })
    setKeyboardHeight(300)
    await measured()

    expect(shift()).toBe(300)
  })

  it('falls back to the whole keyboard when the rect cannot be measured', async () => {
    // No responder, so the engine reports the failure it reports for a method an
    // element does not implement. A container that stayed put would leave the
    // user typing into a field they cannot see.
    const engine = createFakeEngine()
    setEngine(engine.api)
    let shift: () => number = () => 0

    dispose = mount(engine.pageElement, () => {
      shift = keepAboveKeyboard()
      return <input id="email" ref={avoidKeyboard} />
    })
    engine.dispatch(engine.find('input') as FakeElement, 'focus')
    setKeyboardHeight(300)
    await measured()

    expect(shift()).toBe(300)
  })

  it('measures against the bounds it is given rather than the page', async () => {
    // An app whose Lynx view stops above a navigation bar names the element that
    // does reach the bottom, and the arithmetic stays in one coordinate space.
    const engine = createFakeEngine()
    setEngine(engine.api)
    engine.onInvoke('boundingClientRect', (element) => ({
      code: 0,
      data: { bottom: element.tag === 'input' ? 540 : 600 },
    }))
    const field = signal<LynxElement | null>(null)
    let shift: () => number = () => 0

    dispose = mount(engine.pageElement, () => {
      const bounds = (
        <view>
          <input id="email" />
        </view>
      )
      shift = keepAboveKeyboard({ field, bounds })
      return bounds
    })
    field(lynx(engine.find('input')))
    setKeyboardHeight(100)
    await measured()

    // Against the page's 800 this field would clear the keys entirely; against
    // the bounds' 600 it overlaps by 40.
    expect(shift()).toBe(40)
  })
})
