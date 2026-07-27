import { afterEach, describe, expect, it } from 'vitest'

import { clearWorklets, registerWorklet, releaseWorklet } from './worklet-registry'

/**
 * The indirection that makes events work at all.
 *
 * A closure cannot be an event listener on Lynx — the engine stores one and then
 * never invokes it, which is a failure that survives every test not run on a
 * device. So a handle goes to the engine and a global `runWorklet` resolves it
 * back. Everything here is about that round trip, including the two ways it is
 * allowed to find nothing.
 */

/** The engine's own call shape: `runWorklet(value, [event])`, fetched by name at dispatch. */
type RunWorklet = (value: unknown, args?: unknown[]) => unknown

const runWorklet = (): RunWorklet => {
  const installed = (globalThis as { runWorklet?: RunWorklet }).runWorklet
  if (!installed) throw new Error('no runWorklet is installed on the global object')
  return installed
}

/** Replaces the global outright, standing in for another framework already on the page. */
const preinstall = (fn: RunWorklet): void => {
  ;(globalThis as { runWorklet?: RunWorklet }).runWorklet = fn
}

afterEach(() => {
  clearWorklets()
})

describe('worklet-registry', () => {
  it('resolves a handle back to the dispatcher that registered it', () => {
    const received: unknown[] = []
    const handle = registerWorklet((event) => received.push(event))

    runWorklet()(handle.value, [{ detail: { x: 1 } }])

    expect(received).toEqual([{ detail: { x: 1 } }])
  })

  it('hands back a handle in the shape the engine accepts', () => {
    // `{ type: 'worklet', value }` is the only listener form the engine calls on
    // the main thread. The token inside is ours, because the engine never looks
    // at it — that is the observation the whole compilerless design rests on.
    const handle = registerWorklet(() => {})

    expect(handle.type).toBe('worklet')
    expect(typeof handle.value.id).toBe('number')
  })

  it('keeps separate handles pointing at separate dispatchers', () => {
    const fired: string[] = []
    const first = registerWorklet(() => fired.push('first'))
    const second = registerWorklet(() => fired.push('second'))

    runWorklet()(second.value, [{}])
    runWorklet()(first.value, [{}])

    expect(fired).toEqual(['second', 'first'])
  })

  it('installs the global on the first registration rather than eagerly', () => {
    // Import-time side effects would write to a context this package does not
    // own, in a bundle chunk that is evaluated before anyone asked it to run.
    clearWorklets()
    expect('runWorklet' in globalThis).toBe(false)

    registerWorklet(() => {})

    expect('runWorklet' in globalThis).toBe(true)
  })

  it('ignores an unknown token instead of throwing', () => {
    // A stale handle can legitimately arrive for an element removed in the same
    // tick as the gesture that hit it, and throwing out of a native dispatch is
    // a far worse outcome than dropping an event for a node that is gone.
    registerWorklet(() => {})

    expect(() => runWorklet()({ id: 9999 }, [{}])).not.toThrow()
    expect(() => runWorklet()(null, [{}])).not.toThrow()
    expect(() => runWorklet()({}, [{}])).not.toThrow()
  })

  it('ignores a released handle', () => {
    const fired: string[] = []
    const handle = registerWorklet(() => fired.push('handler'))

    releaseWorklet(handle)
    runWorklet()(handle.value, [{}])

    expect(fired).toEqual([])
  })

  it('releasing twice is harmless', () => {
    const handle = registerWorklet(() => {})
    releaseWorklet(handle)

    expect(() => releaseWorklet(handle)).not.toThrow()
  })

  it('dispatches with no event at all rather than failing', () => {
    // The engine supplies the args array; a listener bound for an event that
    // carries no payload should still reach its handler.
    const received: unknown[] = []
    const handle = registerWorklet((event) => received.push(event))

    runWorklet()(handle.value)

    expect(received).toEqual([undefined])
  })

  it('chains to a runWorklet another framework already installed', () => {
    // A page running a migration, or an embedded card, may already own this
    // global. Ours is not the only runtime that wants it, so anything this table
    // does not recognise is passed on rather than swallowed.
    const passedOn: unknown[] = []
    preinstall((value) => {
      passedOn.push(value)
      return 'theirs'
    })

    const handle = registerWorklet(() => {})
    const result = runWorklet()({ id: 9999 }, [{}])

    expect(passedOn).toEqual([{ id: 9999 }])
    expect(result).toBe('theirs')
    // Ours still resolves, so chaining costs the incumbent nothing and costs us
    // nothing either.
    expect(() => runWorklet()(handle.value, [{}])).not.toThrow()
    expect(passedOn).toHaveLength(1)
  })

  it('restores a clean global when cleared', () => {
    registerWorklet(() => {})

    clearWorklets()

    expect('runWorklet' in globalThis).toBe(false)
  })

  it('forgets every dispatcher when cleared', () => {
    const fired: string[] = []
    registerWorklet(() => fired.push('first'))
    const second = registerWorklet(() => fired.push('second'))

    clearWorklets()
    // Re-installs the global so there is something to dispatch through. The
    // table behind it is empty and numbering has restarted, so the handle taken
    // before the clear now names nothing at all.
    registerWorklet(() => {})
    runWorklet()(second.value, [{}])

    expect(fired).toEqual([])
  })
})
