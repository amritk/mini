import { afterEach, describe, expect, it } from 'vitest'

import { setErrorHandler } from '../report-error'
import { createFakeEngine } from '../testing/create-fake-engine'
import { createElement, setText } from '../tree'
import { clearEngine, globalEngine, requireEngine, scheduleFlush, setEngine } from './current-engine'

/**
 * The engine slot and the one commit it schedules per tick.
 *
 * Both halves are module-level state, which is exactly why they are worth
 * pinning: a leaked engine or a stranded flush flag does not fail here, it fails
 * in whatever test happens to run next.
 */

/**
 * Lets the queued commit run.
 *
 * `scheduleFlush` posts its work on the promise job queue, so one turn of the
 * microtask queue is all it takes — the second await is slack, so a change in
 * how the commit is posted does not turn every assertion here into a silent
 * false negative.
 */
const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(async () => {
  // Drain before clearing rather than after. A pending commit leaves the queued
  // flag set, and the next case's `scheduleFlush` would see it and return early
  // — so the flush it was counting on would silently never happen.
  await tick()
  clearEngine()
})

describe('current-engine', () => {
  it('hands back the engine that was installed', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    expect(requireEngine()).toBe(engine.api)
  })

  it('throws a boot-order error when nothing is installed', () => {
    expect(() => requireEngine()).toThrow(/setEngine/)
  })

  it('throws again once the engine is cleared', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    clearEngine()

    expect(() => requireEngine()).toThrow(/No engine installed/)
  })

  it('replaces the installed engine rather than stacking them', () => {
    const first = createFakeEngine()
    const second = createFakeEngine()

    setEngine(first.api)
    setEngine(second.api)

    expect(requireEngine()).toBe(second.api)
  })

  it('coalesces a tick of mutations into a single commit', async () => {
    // The whole point of the scheduler: a hundred property writes cost one
    // commit. Without the coalescing this would be one flush per mutation, which
    // on a device is a whole-tree commit per signal write.
    const engine = createFakeEngine()
    setEngine(engine.api)

    const node = createElement('text')
    for (let i = 0; i < 50; i++) setText(node, `value ${i}`)

    expect(engine.flushes()).toBe(0)
    await tick()
    expect(engine.flushes()).toBe(1)
  })

  it('commits again on the next tick', async () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    createElement('view')
    await tick()
    createElement('view')
    await tick()

    expect(engine.flushes()).toBe(2)
  })

  it('sends the commit to the engine installed when it runs, not when it was scheduled', async () => {
    // Closing over the engine at schedule time would strand a swap: the outgoing
    // engine would receive the commit while the incoming one — the only engine
    // with anything on screen — never got flushed at all.
    const outgoing = createFakeEngine()
    const incoming = createFakeEngine()

    setEngine(outgoing.api)
    scheduleFlush()
    setEngine(incoming.api)
    await tick()

    expect(outgoing.flushes()).toBe(0)
    expect(incoming.flushes()).toBe(1)
  })

  it('drops the commit when the engine is cleared before the tick ends', async () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    scheduleFlush()
    clearEngine()
    await tick()

    expect(engine.flushes()).toBe(0)
  })

  it('schedules nothing at all when no engine is installed', async () => {
    // The guard matters for more than tidiness: setting the queued flag with no
    // engine to clear it would leave the flag stuck, and the first real
    // mutation after boot would never be committed.
    expect(() => scheduleFlush()).not.toThrow()

    const engine = createFakeEngine()
    setEngine(engine.api)
    scheduleFlush()
    await tick()

    expect(engine.flushes()).toBe(1)
  })

  it('reads the PAPI off the global object', () => {
    // How an app gets the real engine: Lynx injects the functions as bare
    // globals, so there is nothing to import.
    expect(globalEngine()).toBe(globalThis)
  })

  it('reports a commit that throws instead of losing it to the job queue', async () => {
    const engine = createFakeEngine()
    const failing = {
      ...engine.api,
      __FlushElementTree: () => {
        throw new Error('the engine refused the commit')
      },
    }
    const reported: string[] = []
    setErrorHandler((_error, source) => reported.push(source))
    setEngine(failing)

    scheduleFlush()
    await tick()

    // Unguarded this is an unhandled rejection, and Lynx's main-thread context
    // is exactly where nothing is listening for one — the missing commit would
    // be the only symptom.
    expect(reported).toEqual(['commit'])
    setErrorHandler(null)
  })

  it('recovers on the next mutation after a commit failed', async () => {
    const engine = createFakeEngine()
    let fail = true
    const flaky = {
      ...engine.api,
      __FlushElementTree: (...args: Parameters<typeof engine.api.__FlushElementTree>) => {
        if (fail) throw new Error('not this time')
        engine.api.__FlushElementTree(...args)
      },
    }
    setErrorHandler(() => {})
    setEngine(flaky)

    scheduleFlush()
    await tick()

    // The flag is cleared before the call rather than after, so one failure
    // does not wedge the scheduler and leave the screen frozen for good.
    fail = false
    scheduleFlush()
    await tick()

    expect(engine.flushes()).toBe(1)
    setErrorHandler(null)
  })
})
