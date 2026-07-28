import { afterEach, describe, expect, it, vi } from 'vitest'

import { addEvent } from '../add-event'
import { clearEngine, setEngine } from '../engine/current-engine'
import type { LynxElement } from '../engine/element-api'
import { setEventTransport } from '../events/transport'
import { clearWorklets } from '../events/worklet-registry'
import { setErrorHandler } from '../report-error'
import { createFakeEngine, type FakeElement, type FakeEngine } from '../testing/create-fake-engine'
import { createElement } from '../tree'
import { clearNamedHandlers, dispatchNamedEvent, HANDLER_PREFIX, namedHandlerTransport } from './named-handlers'

/**
 * The fallback is only worth having if it works end to end, so these cases run
 * the whole round trip the way a device would: bind through the transport, let
 * the engine dispatch to a handler NAME, and hand that name back the way an
 * app's forwarder would after the event crossed a thread. The fake records
 * string dispatches into `publishedEvents()` precisely because that is where a device
 * would have sent them.
 */

const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

const fake = (element: LynxElement): FakeElement => element as unknown as FakeElement

const setup = (): { engine: FakeEngine; view: LynxElement } => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  setEventTransport(namedHandlerTransport)
  return { engine, view: createElement('view') }
}

afterEach(async () => {
  await tick()
  setEventTransport(null)
  setErrorHandler(null)
  clearNamedHandlers()
  clearEngine()
  clearWorklets()
  // Otherwise a case that counts warnings inherits the previous case's spy,
  // and counts its calls too.
  vi.restoreAllMocks()
})

describe('bridge/named-handlers', () => {
  it('binds a handler name the engine will route to the background thread', () => {
    const { view } = setup()

    addEvent(view, 'bindEvent', 'tap', () => {})

    const listener = fake(view).events.get('bindEvent:tap')
    expect(typeof listener).toBe('string')
    expect(listener as string).toContain(HANDLER_PREFIX)
  })

  it('completes the round trip the way an app forwarder would', () => {
    const { engine, view } = setup()
    const fired: unknown[] = []
    addEvent(view, 'bindEvent', 'tap', (event) => fired.push(event))

    engine.dispatch(fake(view), 'tap', { x: 1 })

    // The engine published to a name rather than calling us: on a device this
    // is the point where the event is in the OTHER context.
    const published = engine.publishedEvents()
    expect(published).toHaveLength(1)
    expect(fired).toEqual([])

    // …and this is the app's forwarder handing it back.
    const delivered = dispatchNamedEvent(published[0]?.handler as string, published[0]?.event)

    expect(delivered).toBe(true)
    expect(fired).toEqual([{ x: 1 }])
  })

  it('gives every binding its own name, so two on one element cannot collide', () => {
    const { view } = setup()
    const other = createElement('view')

    addEvent(view, 'bindEvent', 'tap', () => {})
    addEvent(view, 'bindEvent', 'longpress', () => {})
    addEvent(other, 'bindEvent', 'tap', () => {})

    const names = [
      fake(view).events.get('bindEvent:tap'),
      fake(view).events.get('bindEvent:longpress'),
      fake(other).events.get('bindEvent:tap'),
    ]
    expect(new Set(names).size).toBe(3)
  })

  it('forgets the name once the last handler detaches', () => {
    const { view } = setup()
    const dispose = addEvent(view, 'bindEvent', 'tap', () => {})
    const name = fake(view).events.get('bindEvent:tap') as string

    dispose()
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    // The table holds nothing an element does not, so a stale name from a
    // torn-down screen cannot resurrect a handler.
    expect(dispatchNamedEvent(name, {})).toBe(false)
  })

  it('warns rather than throwing on a name it does not know', () => {
    setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // By the time this is called the event already crossed a thread and the
    // element may be gone. That is an ordinary race, not a mistake.
    expect(() => dispatchNamedEvent(`${HANDLER_PREFIX}999`, {})).not.toThrow()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('reports a throwing handler instead of unwinding into the forwarder', () => {
    const { engine, view } = setup()
    const reported: string[] = []
    setErrorHandler((_error, source) => reported.push(source))
    addEvent(view, 'bindEvent', 'tap', () => {
      throw new Error('boom')
    })

    engine.dispatch(fake(view), 'tap')
    const published = engine.publishedEvents()

    expect(() => dispatchNamedEvent(published[0]?.handler as string, published[0]?.event)).not.toThrow()
    expect(reported).toEqual(['event'])
  })
})
