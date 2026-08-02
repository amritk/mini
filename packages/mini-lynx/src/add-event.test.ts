import { afterEach, describe, expect, it } from 'vitest'

import { addEvent } from './add-event'
import { clearEngine, setEngine } from './engine/current-engine'
import type { LynxElement } from './engine/element-api'
import { clearWorklets } from './events/worklet-registry'
import { setErrorHandler } from './report-error'
import { createFakeEngine, type FakeElement, type FakeEngine } from './testing/create-fake-engine'
import { createElement } from './tree'

/**
 * Two engine constraints meet in this module, and every case below is about one
 * of them.
 *
 * The engine keeps ONE listener per `(type, name)` and overwrites silently, so
 * the runtime installs a single dispatcher per pair and fans out to a set of its
 * own — otherwise two components listening for the same tap would leave the
 * first one dead with nothing reported.
 *
 * And the listener cannot be a closure: it has to be a worklet handle the engine
 * hands back to a global `runWorklet`. That indirection is exercised for real
 * here, because the fake dispatches the way the engine does rather than reaching
 * for a stored function.
 */

const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

/** The in-memory node behind an opaque handle. */
const fake = (element: LynxElement): FakeElement => element as unknown as FakeElement

/** Installs a fresh engine and hands back an element to attach handlers to. */
const setup = (): { engine: FakeEngine; view: LynxElement } => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  return { engine, view: createElement('view') }
}

/** Every `__AddEvent` line the engine has seen, which is where the fan-out shows up. */
const registrations = (engine: FakeEngine): readonly string[] =>
  engine.calls().filter((line) => line.startsWith('__AddEvent'))

afterEach(async () => {
  await tick()
  clearEngine()
  clearWorklets()
})

describe('add-event', () => {
  it('registers a worklet handle, never a raw function', () => {
    // The whole reason this module exists in its current shape. A closure is
    // accepted at bind time by a device engine and then never invoked — the tap
    // produces a log line in native and nothing else.
    const { engine, view } = setup()

    addEvent(view, 'bindEvent', 'tap', () => {})

    expect(registrations(engine)).toEqual([`__AddEvent(#${fake(view).id}, "bindEvent", "tap", worklet)`])
    expect(fake(view).events.get('bindEvent:tap')).toMatchObject({ type: 'worklet' })
  })

  it('fires both handlers registered for the same event', () => {
    const { engine, view } = setup()
    const fired: string[] = []

    addEvent(view, 'bindEvent', 'tap', () => fired.push('first'))
    addEvent(view, 'bindEvent', 'tap', () => fired.push('second'))
    engine.dispatch(fake(view), 'tap')

    expect(fired).toEqual(['first', 'second'])
  })

  it('registers exactly one dispatcher with the engine however many handlers attach', () => {
    // The engine would have kept only the last of these. One handle plus a set
    // this module owns is what turns its one-listener rule into add-many.
    const { engine, view } = setup()
    engine.clearCalls()

    addEvent(view, 'bindEvent', 'tap', () => {})
    addEvent(view, 'bindEvent', 'tap', () => {})
    addEvent(view, 'bindEvent', 'tap', () => {})

    expect(registrations(engine)).toHaveLength(1)
  })

  it('passes the engine payload through untouched', () => {
    // Nothing in this package normalises an event, so a handler receives exactly
    // what a device would hand it — including the trip through `runWorklet`.
    const { engine, view } = setup()
    const received: unknown[] = []

    addEvent(view, 'bindEvent', 'tap', (event) => received.push(event))
    engine.dispatch(fake(view), 'tap', { detail: { x: 12, y: 30 } })

    expect(received).toEqual([{ detail: { x: 12, y: 30 } }])
  })

  it('leaves the other handler working when one detaches', () => {
    const { engine, view } = setup()
    const fired: string[] = []
    const detachFirst = addEvent(view, 'bindEvent', 'tap', () => fired.push('first'))
    addEvent(view, 'bindEvent', 'tap', () => fired.push('second'))

    detachFirst()
    engine.dispatch(fake(view), 'tap')

    expect(fired).toEqual(['second'])
  })

  it('drops the dispatcher when the last handler detaches', () => {
    // Otherwise the engine keeps calling into an empty set on every frame of a
    // scroll, which is real work for nothing.
    const { engine, view } = setup()
    const detach = addEvent(view, 'bindEvent', 'tap', () => {})
    engine.clearCalls()

    detach()

    expect(registrations(engine)).toEqual([`__AddEvent(#${fake(view).id}, "bindEvent", "tap", null)`])
    expect(fake(view).events.has('bindEvent:tap')).toBe(false)
  })

  it('releases the worklet handle along with the dispatcher', () => {
    // The registry is a plain map keyed by token, so a handle nobody releases is
    // a closure — and the whole subtree it captured — held for the life of the
    // page.
    const { view } = setup()
    const fired: string[] = []
    const detach = addEvent(view, 'bindEvent', 'tap', () => fired.push('handler'))
    const handle = fake(view).events.get('bindEvent:tap')

    detach()
    // Dispatch the stale handle the way a late engine callback would.
    const runWorklet = (globalThis as { runWorklet?: (value: unknown, args: unknown[]) => void }).runWorklet
    runWorklet?.((handle as { value: unknown }).value, [{}])

    expect(fired).toEqual([])
  })

  it('keeps the dispatcher while any handler remains', () => {
    const { engine, view } = setup()
    const detach = addEvent(view, 'bindEvent', 'tap', () => {})
    addEvent(view, 'bindEvent', 'tap', () => {})
    engine.clearCalls()

    detach()

    expect(registrations(engine)).toEqual([])
  })

  it('registers a fresh dispatcher after the pair was emptied and used again', () => {
    const { engine, view } = setup()
    const fired: string[] = []
    addEvent(view, 'bindEvent', 'tap', () => fired.push('first'))()

    addEvent(view, 'bindEvent', 'tap', () => fired.push('second'))
    engine.dispatch(fake(view), 'tap')

    expect(fired).toEqual(['second'])
  })

  it('survives a handler detaching itself mid-dispatch', () => {
    // The dispatcher walks a COPY of the set for exactly this. Iterating the
    // live set would let a one-shot handler removing itself skip whichever
    // handler happened to be next.
    const { engine, view } = setup()
    const fired: string[] = []
    const detachSelf = addEvent(view, 'bindEvent', 'tap', () => {
      fired.push('self')
      detachSelf()
    })
    addEvent(view, 'bindEvent', 'tap', () => fired.push('other'))

    engine.dispatch(fake(view), 'tap')

    expect(fired).toEqual(['self', 'other'])

    engine.dispatch(fake(view), 'tap')

    expect(fired).toEqual(['self', 'other', 'other'])
  })

  it('survives a lone handler detaching itself mid-dispatch', () => {
    // The one-handler case takes its own path through the dispatcher — it reads
    // the handler out rather than copying a set of one — so it needs the
    // self-detach guarantee proved separately from the fan-out case above.
    const { engine, view } = setup()
    const fired: string[] = []
    const detachSelf = addEvent(view, 'bindEvent', 'tap', () => {
      fired.push('once')
      detachSelf()
    })

    engine.dispatch(fake(view), 'tap')
    engine.dispatch(fake(view), 'tap')

    expect(fired).toEqual(['once'])
    // Detaching the last handler drops the dispatcher, so the engine is not left
    // calling into an empty registration.
    expect(registrations(engine)).toEqual([
      `__AddEvent(#${fake(view).id}, "bindEvent", "tap", worklet)`,
      `__AddEvent(#${fake(view).id}, "bindEvent", "tap", null)`,
    ])
  })

  it('does not run a handler attached by the lone handler until the next dispatch', () => {
    // A handler bound during delivery belongs to the NEXT event, not the one
    // being delivered. The fan-out path gets that from copying the set; the
    // one-handler path has to get it from reading the handler out first, which
    // is the case this pins.
    const { engine, view } = setup()
    const fired: string[] = []
    addEvent(view, 'bindEvent', 'tap', () => {
      fired.push('first')
      if (fired.length === 1) addEvent(view, 'bindEvent', 'tap', () => fired.push('late'))
    })

    engine.dispatch(fake(view), 'tap')

    expect(fired).toEqual(['first'])

    engine.dispatch(fake(view), 'tap')

    expect(fired).toEqual(['first', 'first', 'late'])
  })

  it('survives a handler detaching a later one mid-dispatch', () => {
    const { engine, view } = setup()
    const fired: string[] = []
    addEvent(view, 'bindEvent', 'tap', () => {
      fired.push('first')
      detachSecond()
    })
    const detachSecond = addEvent(view, 'bindEvent', 'tap', () => fired.push('second'))

    engine.dispatch(fake(view), 'tap')

    // The copy was taken before the walk, so the second handler still runs on
    // the dispatch it was attached for, and never again.
    expect(fired).toEqual(['first', 'second'])

    engine.dispatch(fake(view), 'tap')

    expect(fired).toEqual(['first', 'second', 'first'])
  })

  it('detaching twice is harmless', () => {
    const { view } = setup()
    const detach = addEvent(view, 'bindEvent', 'tap', () => {})
    addEvent(view, 'bindEvent', 'tap', () => {})

    detach()

    expect(() => detach()).not.toThrow()
    // The second call must not take the surviving handler down with it.
    expect(fake(view).events.has('bindEvent:tap')).toBe(true)
  })

  it('keeps the propagation types apart', () => {
    // `bindtap` and `catchtap` are different listeners on the same element, and
    // the difference decides whether a tap reaches an ancestor at all.
    const { engine, view } = setup()
    const fired: string[] = []

    addEvent(view, 'bindEvent', 'tap', () => fired.push('bind'))
    addEvent(view, 'catchEvent', 'tap', () => fired.push('catch'))
    engine.dispatch(fake(view), 'tap', {}, 'catchEvent')

    expect(fired).toEqual(['catch'])
  })

  it('keeps the event names apart', () => {
    const { engine, view } = setup()
    const fired: string[] = []

    addEvent(view, 'bindEvent', 'tap', () => fired.push('tap'))
    addEvent(view, 'bindEvent', 'longpress', () => fired.push('longpress'))
    engine.dispatch(fake(view), 'longpress')

    expect(fired).toEqual(['longpress'])
  })

  it('keeps the elements apart', () => {
    const { engine, view } = setup()
    const other = createElement('view')
    const fired: string[] = []

    addEvent(view, 'bindEvent', 'tap', () => fired.push('view'))
    addEvent(other, 'bindEvent', 'tap', () => fired.push('other'))
    engine.dispatch(fake(other), 'tap')

    expect(fired).toEqual(['other'])
  })

  it('keeps one handler throwing from costing the others their event', () => {
    const { engine, view } = setup()
    const fired: string[] = []
    const reported: string[] = []
    setErrorHandler((_error, source) => reported.push(source))

    addEvent(view, 'bindEvent', 'tap', () => {
      throw new Error('boom')
    })
    addEvent(view, 'bindEvent', 'tap', () => fired.push('second'))

    engine.dispatch(fake(view), 'tap')

    // Handlers on one pair did not choose to share a dispatcher — a component
    // bound one and a `ref` bound the other — so one of them failing must not
    // silently unsubscribe the rest.
    expect(fired).toEqual(['second'])
    expect(reported).toEqual(['event'])
    setErrorHandler(null)
  })

  it('does not let a handler throw into the engine dispatch', () => {
    const { engine, view } = setup()
    setErrorHandler(() => {})

    addEvent(view, 'bindEvent', 'tap', () => {
      throw new Error('boom')
    })

    // An exception unwinding into native event delivery is undefined behaviour
    // that ranges from the rest of the frame being skipped to the app going
    // down. `engine.dispatch` goes through the real `runWorklet` indirection,
    // so this is the device's path rather than beside it.
    expect(() => engine.dispatch(fake(view), 'tap')).not.toThrow()
    setErrorHandler(null)
  })
})
