import { afterEach, describe, expect, it, vi } from 'vitest'

import { addEvent } from '../add-event'
import { clearEngine, setEngine } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { setErrorHandler } from '../report-error'
import { createFakeEngine, type FakeElement, type FakeEngine } from '../testing/create-fake-engine'
import { createElement } from '../tree'
import { type EventTransport, setEventTransport, workletTransport } from './transport'
import { clearWorklets } from './worklet-registry'

/**
 * The seam exists because event delivery is the one engine assumption in this
 * package a device could still disprove. These cases pin the two halves of that:
 * the default is unchanged for everybody who never touches it, and an installed
 * transport genuinely decides what the engine is handed.
 */

const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

const fake = (element: LynxElement): FakeElement => element as unknown as FakeElement

const setup = (): { engine: FakeEngine; view: LynxElement } => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  return { engine, view: createElement('view') }
}

afterEach(async () => {
  await tick()
  setEventTransport(null)
  setErrorHandler(null)
  clearEngine()
  clearWorklets()
})

describe('events/transport', () => {
  it('binds through the worklet transport by default', () => {
    const { view } = setup()

    addEvent(view, 'bindEvent', 'tap', () => {})

    // The default is the whole reason this runtime is compilerless and its
    // handlers run in the gesture's own frame. A seam that quietly changed it
    // would be a regression dressed as flexibility.
    expect(fake(view).events.get('bindEvent:tap')).toMatchObject({ type: 'worklet' })
  })

  it('hands the engine whatever the installed transport returns', () => {
    const { engine, view } = setup()
    setEventTransport(() => ({ listener: 'app:handler-1', release: () => {} }))

    addEvent(view, 'bindEvent', 'tap', () => {})

    // A string listener is the fallback's shape, and the engine accepts it —
    // this is what makes /bridge a config change rather than a fork.
    expect(fake(view).events.get('bindEvent:tap')).toBe('app:handler-1')
    expect(engine.calls()).toContain(`__AddEvent(#${fake(view).id}, "bindEvent", "tap", "app:handler-1")`)
  })

  it('routes the fan-out through the transport, not around it', () => {
    const { view } = setup()
    const delivered: unknown[] = []
    const transport: EventTransport = (dispatch) => {
      delivered.push(dispatch)
      return { listener: 'app:handler-1', release: () => {} }
    }
    setEventTransport(transport)

    const fired: string[] = []
    addEvent(view, 'bindEvent', 'tap', () => fired.push('first'))
    addEvent(view, 'bindEvent', 'tap', () => fired.push('second'))

    // One dispatcher per (type, name) whichever transport is installed — the
    // engine's single-listener constraint is not the transport's to relax.
    expect(delivered).toHaveLength(1)
    ;(delivered[0] as (event: unknown) => void)({})
    expect(fired).toEqual(['first', 'second'])
  })

  it('releases the transport binding when the last handler detaches', () => {
    const { view } = setup()
    const release = vi.fn()
    setEventTransport(() => ({ listener: 'app:handler-1', release }))

    const first = addEvent(view, 'bindEvent', 'tap', () => {})
    const second = addEvent(view, 'bindEvent', 'tap', () => {})

    first()
    // Still one handler left, so the engine is still holding this listener.
    expect(release).not.toHaveBeenCalled()

    second()
    expect(release).toHaveBeenCalledTimes(1)
    expect(fake(view).events.has('bindEvent:tap')).toBe(false)
  })

  it('goes back to the default when the transport is cleared', () => {
    const { view } = setup()
    setEventTransport(() => ({ listener: 'app:handler-1', release: () => {} }))
    setEventTransport(null)

    addEvent(view, 'bindEvent', 'tap', () => {})

    expect(fake(view).events.get('bindEvent:tap')).toMatchObject({ type: 'worklet' })
  })

  it('leaves listeners already bound alone when the transport changes', () => {
    const { view } = setup()
    const before = createElement('view')
    addEvent(before, 'bindEvent', 'tap', () => {})

    setEventTransport(() => ({ listener: 'app:handler-1', release: () => {} }))
    addEvent(view, 'bindEvent', 'tap', () => {})

    // Rebinding would mean walking a tree the engine owns. Switching is a
    // startup decision, and the documentation says so.
    expect(fake(before).events.get('bindEvent:tap')).toMatchObject({ type: 'worklet' })
    expect(fake(view).events.get('bindEvent:tap')).toBe('app:handler-1')
  })

  it('exports the default transport so it can be restored by name', () => {
    const { view } = setup()
    setEventTransport(() => ({ listener: 'app:handler-1', release: () => {} }))
    setEventTransport(workletTransport)

    addEvent(view, 'bindEvent', 'tap', () => {})

    expect(fake(view).events.get('bindEvent:tap')).toMatchObject({ type: 'worklet' })
  })
})
