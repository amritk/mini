import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearEngine, setEngine } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { clearWorklets } from '../events/worklet-registry'
import { mount } from '../mount'
import { createFakeEngine } from '../testing/create-fake-engine'
import { GestureType, nextGestureId, setGestureDetector } from './set-gesture-detector'

afterEach(() => {
  clearEngine()
  clearWorklets()
})

const render = () => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  return engine
}

describe('setGestureDetector', () => {
  it('installs a recogniser with its type and relations', () => {
    const engine = render()
    let host!: LynxElement
    mount(engine.pageElement, () => <view ref={(el: LynxElement) => (host = el)} />)

    setGestureDetector(host, { id: 7, type: GestureType.TAP, waitFor: [4], simultaneous: [5] })

    const view = engine.find('view') as never as { gestures: Map<number, Record<string, unknown>> }
    expect(view.gestures.get(7)).toMatchObject({
      type: GestureType.TAP,
      // The three relation keys are always present, so the engine never has to
      // distinguish "no relation" from "the framework forgot to say".
      relationMap: { waitFor: [4], simultaneous: [5], continueWith: [] },
    })
  })

  it('gates the arbiter on the two attributes the engine requires', () => {
    const engine = render()
    let host!: LynxElement
    mount(engine.pageElement, () => <view ref={(el: LynxElement) => (host = el)} />)

    setGestureDetector(host, { id: 1, type: GestureType.PAN })

    const view = engine.find('view') as never as { attrs: Record<string, unknown> }
    // Without these the detector is installed and then never consulted: the
    // engine gates on `has-react-gesture`, and a flattened element has no touch
    // target of its own to hit-test.
    expect(view.attrs['has-react-gesture']).toBe(true)
    expect(view.attrs['flatten']).toBe(false)
  })

  it('dispatches a callback through the worklet path, never as a closure', () => {
    const engine = render()
    let host!: LynxElement
    mount(engine.pageElement, () => <view ref={(el: LynxElement) => (host = el)} />)
    const onUpdate = vi.fn()

    setGestureDetector(host, { id: 2, type: GestureType.PAN, callbacks: { onUpdate } })
    const view = engine.find('view') as never as never
    engine.dispatchGesture(view, 2, 'onUpdate', { deltaX: 12 })

    expect(onUpdate).toHaveBeenCalledWith({ deltaX: 12 })
  })

  it('hands the engine a worklet handle rather than the function', () => {
    const engine = render()
    let host!: LynxElement
    mount(engine.pageElement, () => <view ref={(el: LynxElement) => (host = el)} />)

    setGestureDetector(host, { id: 3, type: GestureType.PAN, callbacks: { onEnd: () => {} } })

    const view = engine.find('view') as never as {
      gestures: Map<number, { config: { callbacks: { name: string; callback: unknown }[] } }>
    }
    const entry = view.gestures.get(3)?.config.callbacks[0]
    expect(entry?.name).toBe('onEnd')
    // The same trap as `__AddEvent`: a raw closure is stored and then silently
    // never invoked on a device.
    expect(entry?.callback).toMatchObject({ type: 'worklet' })
    expect(typeof entry?.callback).not.toBe('function')
  })

  it('carries recogniser tuning through untouched', () => {
    const engine = render()
    let host!: LynxElement
    mount(engine.pageElement, () => <view ref={(el: LynxElement) => (host = el)} />)

    setGestureDetector(host, { id: 4, type: GestureType.LONG_PRESS, config: { minDuration: 400 } })

    const view = engine.find('view') as never as {
      gestures: Map<number, { config: { config?: Record<string, unknown> } }>
    }
    // What a recogniser type reads is the engine's business, so this package
    // passes it through rather than naming the options.
    expect(view.gestures.get(4)?.config.config).toEqual({ minDuration: 400 })
  })

  it('removes the recogniser on dispose, and is safe to call twice', () => {
    const engine = render()
    let host!: LynxElement
    mount(engine.pageElement, () => <view ref={(el: LynxElement) => (host = el)} />)

    const dispose = setGestureDetector(host, { id: 5, type: GestureType.TAP })
    const view = engine.find('view') as never as { gestures: Map<number, unknown> }
    expect(view.gestures.has(5)).toBe(true)

    dispose()
    dispose()

    expect(view.gestures.has(5)).toBe(false)
    expect(engine.calls().filter((call) => call.startsWith('__RemoveGestureDetector'))).toHaveLength(1)
  })

  it('stops dispatching to a disposed recogniser', () => {
    const engine = render()
    let host!: LynxElement
    mount(engine.pageElement, () => <view ref={(el: LynxElement) => (host = el)} />)
    const onEnd = vi.fn()

    const dispose = setGestureDetector(host, { id: 6, type: GestureType.TAP, callbacks: { onEnd } })
    dispose()
    engine.dispatchGesture(engine.find('view') as never, 6, 'onEnd')

    // Disposal releases the worklet handles too; leaving them registered would
    // keep the component's closures alive for as long as the page.
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('hands out ids that do not collide', () => {
    expect(new Set([nextGestureId(), nextGestureId(), nextGestureId()]).size).toBe(3)
  })
})
