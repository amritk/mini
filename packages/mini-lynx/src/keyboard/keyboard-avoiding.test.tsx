import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, mount, setEngine } from '../index'
import { setReducedMotion } from '../reduced-motion'
import { createFakeEngine, type FakeElement, type FakeEngine } from '../testing/create-fake-engine'
import { avoidKeyboard } from './avoid-keyboard'
import { KeyboardAvoiding } from './keyboard-avoiding'
import { setKeyboardHeight } from './keyboard-height'

/** The tree from the case that is running, torn down before the next one — see `keep-above-keyboard.test.tsx`. */
let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
  clearEngine()
  setKeyboardHeight(0)
  setReducedMotion(false)
})

/** The container the component owns, which is the mounted tree's only child. */
const containerOf = (engine: FakeEngine): FakeElement => engine.page.children[0] as FakeElement

/** Answers every rect, so the measured behaviour has a layout to work from. */
const layout = (engine: FakeEngine, fieldBottom: number, screenBottom = 800): void => {
  engine.onInvoke('boundingClientRect', (element) => ({
    code: 0,
    data: { bottom: element.tag === 'page' ? screenBottom : fieldBottom },
  }))
}

/** Long enough for a `boundingClientRect` round trip to resolve and settle. */
const measured = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('keyboard-avoiding', () => {
  it('sits still while the keyboard is closed', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    dispose = mount(engine.pageElement, () => (
      <KeyboardAvoiding>
        <input ref={avoidKeyboard} />
      </KeyboardAvoiding>
    ))

    expect(containerOf(engine).styles['transform']).toBe('translateY(0px)')
  })

  it('rises by the focused field overlap', async () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    layout(engine, 540)

    dispose = mount(engine.pageElement, () => (
      <KeyboardAvoiding>
        <input ref={avoidKeyboard} />
      </KeyboardAvoiding>
    ))
    engine.dispatch(engine.find('input') as FakeElement, 'focus')
    setKeyboardHeight(300)
    await measured()

    expect(containerOf(engine).styles['transform']).toBe('translateY(-40px)')
  })

  it('reserves the keyboard height instead when asked to pad', async () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    dispose = mount(engine.pageElement, () => (
      <KeyboardAvoiding behavior="padding">
        <input ref={avoidKeyboard} />
      </KeyboardAvoiding>
    ))
    setKeyboardHeight(300)
    await measured()

    expect(containerOf(engine).styles['padding-bottom']).toBe('300px')
    // Padding reserves space rather than moving the container, so nothing here
    // may also translate it — a field inside would then clear the keys twice.
    expect(containerOf(engine).styles['transform']).toBeUndefined()
  })

  it('subtracts an inset an ancestor already pads for', async () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    dispose = mount(engine.pageElement, () => (
      <KeyboardAvoiding behavior="padding" inset={34}>
        <input ref={avoidKeyboard} />
      </KeyboardAvoiding>
    ))
    setKeyboardHeight(300)
    await measured()

    expect(containerOf(engine).styles['padding-bottom']).toBe('266px')
  })

  it('goes back to rest when the keyboard closes', async () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    layout(engine, 540)

    dispose = mount(engine.pageElement, () => (
      <KeyboardAvoiding>
        <input ref={avoidKeyboard} />
      </KeyboardAvoiding>
    ))
    engine.dispatch(engine.find('input') as FakeElement, 'focus')
    setKeyboardHeight(300)
    await measured()

    setKeyboardHeight(0)
    await measured()

    expect(containerOf(engine).styles['transform']).toBe('translateY(0px)')
  })

  it('lays its own declaration over the style it is given', async () => {
    // The container is an ordinary `view` with whatever style the app wants; the
    // one declaration the component owns is the one that moves it.
    const engine = createFakeEngine()
    setEngine(engine.api)
    layout(engine, 540)

    dispose = mount(engine.pageElement, () => (
      <KeyboardAvoiding style={{ backgroundColor: '#fff', flexDirection: 'column' }}>
        <input ref={avoidKeyboard} />
      </KeyboardAvoiding>
    ))
    engine.dispatch(engine.find('input') as FakeElement, 'focus')
    setKeyboardHeight(300)
    await measured()

    const styles = containerOf(engine).styles
    expect(styles['background-color']).toBe('#fff')
    expect(styles['flex-direction']).toBe('column')
    expect(styles['transform']).toBe('translateY(-40px)')
  })

  it('transitions the property it moves and nothing else', () => {
    // `all` would drag an app's own colour change along with a padding change,
    // which is a bug nobody would think to look for in here.
    const engine = createFakeEngine()
    setEngine(engine.api)

    dispose = mount(engine.pageElement, () => (
      <KeyboardAvoiding behavior="padding">
        <input ref={avoidKeyboard} />
      </KeyboardAvoiding>
    ))

    expect(containerOf(engine).styles['transition']).toBe('padding-bottom 0.25s')
  })

  it('drops the transition when the user asked for reduced motion', () => {
    // Handled above the seam, exactly as `RouteStack` does it, so an app states
    // the preference once and everything that moves honours it.
    const engine = createFakeEngine()
    setEngine(engine.api)
    setReducedMotion(true)

    dispose = mount(engine.pageElement, () => (
      <KeyboardAvoiding>
        <input ref={avoidKeyboard} />
      </KeyboardAvoiding>
    ))

    expect(containerOf(engine).styles['transition']).toBeUndefined()
  })

  it('takes no transition at all when asked for none', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    dispose = mount(engine.pageElement, () => (
      <KeyboardAvoiding transition={false}>
        <input ref={avoidKeyboard} />
      </KeyboardAvoiding>
    ))

    expect(containerOf(engine).styles['transition']).toBeUndefined()
  })

  it('builds an ordinary view with no layout opinion of its own', () => {
    // A container that quietly became a flex column would change the layout of
    // everything an app wrapped in it — and Lynx's default display is `linear`,
    // so the damage would be children laying out along the other axis.
    const engine = createFakeEngine()
    setEngine(engine.api)

    dispose = mount(engine.pageElement, () => (
      <KeyboardAvoiding transition={false}>
        <input ref={avoidKeyboard} />
      </KeyboardAvoiding>
    ))

    const container = containerOf(engine)
    expect(container.tag).toBe('view')
    expect(Object.keys(container.styles)).toEqual(['transform'])
    expect(container.children).toHaveLength(1)
  })
})
