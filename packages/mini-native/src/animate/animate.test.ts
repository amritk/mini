import { afterEach, describe, expect, it } from 'vitest'

import type { Host } from '../host'
import { createMemoryHost } from '../hosts/create-memory-host'
import { clearHost, effect, setHost, signal } from '../index'
import type { HostElement } from '../types'
import { animate } from './animate'

afterEach(() => {
  clearHost()
})

/** A host with no `animate`, which is what every host was before this seam existed. */
const withoutAnimation = (host: Host): Host => {
  const { animate: _dropped, ...rest } = host
  return rest
}

describe('animate', () => {
  it('hands the whole timeline to the host in one call', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const element = memory.host.createElement('view')

    animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })

    // The point of the seam: one description, not one write per frame.
    expect(memory.animations).toHaveLength(1)
    expect(memory.animations[0]?.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }])
    expect(memory.animations[0]?.timing).toEqual({ duration: 200, easing: 'ease-out' })
  })

  it('leaves `essential` out of the timing the host receives', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const element = memory.host.createElement('view')

    animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, essential: true })

    // `essential` is an instruction to this function, not to the engine. Passing
    // it through would put a field in the descriptor that no host knows about.
    expect(memory.animations[0]?.timing).toEqual({ duration: 200 })
  })

  it('resolves finished immediately when the host cannot animate', async () => {
    const memory = createMemoryHost()
    setHost(withoutAnimation(memory.host))
    const element = memory.host.createElement('view')

    const running = animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 })

    // `finished`, not `cancelled`, and that distinction is the whole safety of
    // skipping: whatever the caller queued behind the animation still runs.
    await expect(running.finished).resolves.toBe('finished')
    expect(memory.animations).toHaveLength(0)
  })

  it('skips the animation when the user asked for reduced motion', async () => {
    const memory = createMemoryHost()
    setHost({ ...memory.host, environment: { reduceMotion: () => true } })
    const element = memory.host.createElement('view')

    const running = animate(element, [{ translateY: 40 }, { translateY: 0 }], { duration: 200 })

    await expect(running.finished).resolves.toBe('finished')
    expect(memory.animations).toEqual([])
  })

  it('runs anyway when the motion is marked essential', () => {
    const memory = createMemoryHost()
    setHost({ ...memory.host, environment: { reduceMotion: () => true } })
    const element = memory.host.createElement('view')

    animate(element, [{ rotate: '0deg' }, { rotate: '360deg' }], {
      duration: 900,
      iterations: Number.POSITIVE_INFINITY,
      essential: true,
    })

    expect(memory.animations).toHaveLength(1)
  })

  it('animates when the host reports the preference is off', () => {
    const memory = createMemoryHost()
    setHost({ ...memory.host, environment: { reduceMotion: () => false } })
    const element = memory.host.createElement('view')

    animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 })

    expect(memory.animations).toHaveLength(1)
  })

  it('does not subscribe the caller to the motion preference', () => {
    const memory = createMemoryHost()
    const reduce = signal(false)
    setHost({ ...memory.host, environment: { reduceMotion: reduce } })
    const element = memory.host.createElement('view')
    let runs = 0

    effect(() => {
      runs += 1
      animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 })
    })
    reduce(true)

    // Starting an animation inside an effect is legal — a `watch` on the route
    // animating the outgoing screen, say — and toggling an accessibility setting
    // must not re-run whatever else that effect does.
    expect(runs).toBe(1)
  })

  it('reports how the animation ended', async () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const element = memory.host.createElement('view')

    const completed = animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 })
    const interrupted = animate(element, [{ opacity: 1 }, { opacity: 0 }], { duration: 100 })
    memory.animations[0]?.finish()
    memory.animations[1]?.cancel()

    // The distinction a caller actually needs: fading a row out and then
    // removing it is right only if the fade reached the end.
    await expect(completed.finished).resolves.toBe('finished')
    await expect(interrupted.finished).resolves.toBe('cancelled')
  })

  it('treats finishing an endless animation as cancelling it', async () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const element = memory.host.createElement('view')

    const spin = animate(element, [{ rotate: '0deg' }, { rotate: '360deg' }], {
      duration: 900,
      iterations: Number.POSITIVE_INFINITY,
    })
    spin.finish()

    // There is no last frame to jump to, so the honest report is that something
    // stopped it rather than that it ran its course.
    await expect(spin.finished).resolves.toBe('cancelled')
  })

  it('settles only once, however many times it is stopped', async () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const element = memory.host.createElement('view')

    const running = animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 })
    running.cancel()
    running.finish()
    running.cancel()

    // A promise keeps its first answer, so the risk is not a changed value but a
    // host that treats the second stop as a fresh one. The recorded state is
    // where that would show.
    await expect(running.finished).resolves.toBe('cancelled')
    expect(memory.animations[0]?.state).toBe('cancelled')
  })

  it('never touches the element it animates', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const element = memory.host.createElement('view') as HostElement
    memory.host.setStyle(element, { opacity: 1 })

    const running = animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 })
    running.finish()

    // The rule the whole design rests on: the animation is how the element gets
    // somewhere, never where it ends up. A finished animation leaves the style
    // bag exactly as the app wrote it, which is why skipping one is safe.
    expect(memory.animations[0]?.element.style).toEqual({ opacity: 1 })
  })
})
