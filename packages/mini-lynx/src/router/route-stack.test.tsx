import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearEngine, mount, onCleanup, setEngine, signal } from '../index'
import { createFakeEngine, type FakeElement, type FakeEngine } from '../testing/create-fake-engine'
import { serializeTree } from '../testing/serialize-tree'
import { createMemoryHistory } from './create-memory-history'
import { createRouter, type Route, type Router } from './create-router'
import { RouteStack } from './route-stack'
import { fadeTransition, type StackTransition } from './stack-transition'

// The fade waits on timers — an inline CSS transition is the engine's to
// interpolate, so all this side has is the clock. Faking it keeps every
// transition case deterministic and instant instead of sleeping through a real
// 180ms, and nothing else in the suite uses a timer at all.
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  clearEngine()
})

const routes: Route[] = [
  { path: '/', view: () => <text>home</text> },
  { path: '/users/:id', view: (params) => <text>{() => `user ${params()['id']}`}</text> },
  { path: '/settings', view: () => <text>settings</text> },
]

/** The stack's container — the stack's own element, and the mounted tree's only child. */
const containerOf = (engine: FakeEngine): FakeElement => engine.page.children[0] as FakeElement

/** The cards, in tree order — bottom of the stack first. */
const cards = (engine: FakeEngine): FakeElement[] => containerOf(engine).children

/** What each card holds, as text, so a whole stack reads as one assertion. */
const screens = (engine: FakeEngine): string[] => cards(engine).map((card) => serializeTree(card).replace(/\s+/g, ' '))

/**
 * The declarations a card carries when nothing is animating it.
 *
 * Spelled out rather than imported so the test pins what reaches the ENGINE —
 * CSS property names, and numbers that have grown their unit on the way through
 * `applyStyle`. A transition that leaves anything behind shows up as an extra
 * key here.
 */
const CARD_STYLE = {
  position: 'absolute',
  top: '0px',
  right: '0px',
  bottom: '0px',
  left: '0px',
  display: 'flex',
  'flex-direction': 'column',
}

/** Runs every timer the fade queued, and the microtasks between them. */
const runTransitions = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(1000)
}

/**
 * Mounts a stack, drives it, and hands back the tree it settles into.
 *
 * Each call gets its own engine so two runs can be compared as strings, which is
 * how the "a transition is how a screen arrives, never what it is" rule is
 * asserted: the same navigation with and without one has to end identically.
 */
const settledTree = async (
  transition: StackTransition | undefined,
  drive: (router: Router<Route>) => void,
): Promise<string> => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  const router = createRouter({ routes, history: createMemoryHistory() })

  mount(engine.pageElement, () => <RouteStack router={router} {...(transition ? { transition } : {})} />)
  drive(router)
  await runTransitions()

  const tree = serializeTree(engine.page)
  clearEngine()
  return tree
}

describe('route-stack', () => {
  it('renders the screen it starts on', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={router} />)

    expect(cards(engine)).toHaveLength(1)
    expect(serializeTree(engine.page)).toContain('"home"')
  })

  it('pushes a screen over the one it came from', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={router} />)
    router.navigate('/users/1')

    // Both screens are built; only the top one is showing.
    const built = screens(engine)
    expect(built).toHaveLength(2)
    expect(built[0]).toContain('"home"')
    expect(built[1]).toContain('"user 1"')
    expect(cards(engine)[0]?.styles['display']).toBe('none')
    expect(cards(engine)[1]?.styles['display']).toBe('flex')
  })

  it('takes a buried screen out of the layout rather than painting over it', () => {
    // The card underneath is hidden through `applyVisible`, which means
    // `display: none` on the one channel Lynx keeps an element's style in. A
    // screen that was merely covered would still lay out, still measure, and
    // still be reachable — and `display: none` is what makes it genuinely gone.
    // This is what the old DOM suite asserted through the tab order; on Lynx
    // there is no document to walk, and the declaration IS the assertion.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={router} />)
    router.navigate('/settings')

    const [beneath, top] = cards(engine)
    expect(beneath?.styles['display']).toBe('none')
    expect(top?.styles['display']).not.toBe('none')

    // And it comes back to what its own style asked for on the way out, rather
    // than to a default this package would have had to guess — Lynx's is
    // `linear`, and it is configurable per page.
    router.back()
    expect(cards(engine)[0]?.styles['display']).toBe('flex')
  })

  it('keeps a buried screen alive rather than tearing it down', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const label = signal('first')
    let disposed = 0

    const stateful: Route[] = [
      {
        path: '/',
        view: () => {
          onCleanup(() => {
            disposed += 1
          })
          return <text>{label}</text>
        },
      },
      { path: '/settings', view: () => <text>settings</text> },
    ]
    const router = createRouter({ routes: stateful, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={router} />)
    router.navigate('/settings')

    // The screen underneath was never disposed, and its bindings still run —
    // which is the whole reason a stack keeps them: a scroll position and a
    // half-filled form are still there on the way back.
    expect(disposed).toBe(0)
    label('second')
    expect(screens(engine)[0]).toContain('"second"')
  })

  it('pops back to the screen it left, without rebuilding it', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    let built = 0

    const counted: Route[] = [
      {
        path: '/',
        view: () => {
          built += 1
          return <text>home</text>
        },
      },
      { path: '/settings', view: () => <text>settings</text> },
    ]
    const counting = createRouter({ routes: counted, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={counting} />)
    counting.navigate('/settings')
    counting.back()

    expect(cards(engine)).toHaveLength(1)
    expect(serializeTree(engine.page)).toContain('"home"')
    expect(built).toBe(1)
    expect(counting.route().path).toBe('/')
  })

  it('updates params in place when the route did not change', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory({ path: '/users/1', search: '' }) })

    mount(engine.pageElement, () => <RouteStack router={router} />)
    router.navigate('/users/2', { replace: true })

    // A replace is not a step, so this is one screen reporting new params —
    // the same thing `RouteView` does.
    expect(cards(engine)).toHaveLength(1)
    expect(screens(engine)[0]).toContain('"user 2"')
  })

  it('pushes a second screen for the same route when it was not a replace', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory({ path: '/users/1', search: '' }) })

    mount(engine.pageElement, () => <RouteStack router={router} />)
    router.navigate('/users/2')

    // The distinction the matched route cannot make and the depth can.
    const built = screens(engine)
    expect(built).toHaveLength(2)
    expect(built[0]).toContain('"user 1"')
    expect(built[1]).toContain('"user 2"')
  })

  it('swaps the top screen for a replace onto a different route', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={router} />)
    router.navigate('/settings', { replace: true })

    expect(cards(engine)).toHaveLength(1)
    expect(screens(engine)[0]).toContain('"settings"')
  })

  it('pops every screen a multi-step back skipped over', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const history = createMemoryHistory()
    const router = createRouter({ routes, history })

    mount(engine.pageElement, () => <RouteStack router={router} />)
    router.navigate('/users/1')
    router.navigate('/users/2')
    router.navigate('/settings')
    expect(cards(engine)).toHaveLength(4)

    history.back()
    history.back()
    history.back()

    expect(cards(engine)).toHaveLength(1)
    expect(screens(engine)[0]).toContain('"home"')
  })

  it('renders the fallback for a location that matched nothing', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={router} fallback={() => <text>missing</text>} />)
    router.navigate('/nope')

    expect(screens(engine)[1]).toContain('"missing"')
  })

  it('holds the outgoing screen until the transition finishes', async () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={router} transition={fadeTransition()} />)
    router.navigate('/settings')
    router.back()

    // The popped screen is still in the tree, mid-fade: removing it up front
    // would tear it out from under the transition that is moving it. Both cards
    // are carrying the fade's origin opacity, written before the engine is
    // asked to interpolate away from it.
    expect(cards(engine)).toHaveLength(2)
    expect(cards(engine)[0]?.styles['opacity']).toBe('0')
    expect(cards(engine)[1]?.styles['opacity']).toBe('1')

    await runTransitions()

    expect(cards(engine)).toHaveLength(1)
    expect(screens(engine)[0]).toContain('"home"')
  })

  it('hands the engine a transition to interpolate rather than stepping the opacity itself', async () => {
    // The whole point of rebuilding the fade on an inline CSS transition: this
    // side writes a destination once and the engine owns every frame between,
    // off the JavaScript thread. A runtime that animated by writing values on a
    // timer would show up here as a stream of `__SetInlineStyles` calls.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={router} transition={fadeTransition({ duration: 200 })} />)
    router.navigate('/settings')
    engine.clearCalls()
    await runTransitions()

    const declarations = engine.calls().filter((call) => call.includes('__SetInlineStyles'))
    // One opacity write per card over the whole 200ms and no more — the
    // destination — and each of them carries the shorthand that tells the engine
    // to take its time getting there. The origin went in before the log was
    // cleared; everything after is the release, which carries no opacity at all.
    const opacities = declarations.filter((call) => call.includes('"opacity"'))
    expect(opacities).toHaveLength(2)
    expect(opacities.every((call) => call.includes('"transition":"opacity 200ms ease 0ms"'))).toBe(true)
  })

  it('leaves no style behind once a transition settles', async () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={router} transition={fadeTransition()} />)
    router.navigate('/settings')
    await runTransitions()

    // The card is back to exactly the stack's own positioning: no `opacity` left
    // at the value the fade happened to stop on, and no `transition` left to
    // animate the next unrelated style write the screen makes.
    expect(cards(engine)[1]?.styles).toEqual(CARD_STYLE)
    // And the buried one carries that same bag plus the one declaration hiding
    // it, rather than a half-faded opacity.
    expect(cards(engine)[0]?.styles).toEqual({ ...CARD_STYLE, display: 'none' })
  })

  it('settles the tree even when a transition is cut short by the next navigation', async () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={router} transition={fadeTransition()} />)
    router.navigate('/settings')
    // Interrupts the push, whose fade is still mid-flight and whose promise the
    // stack has already stopped listening to.
    router.back()
    await runTransitions()

    expect(cards(engine)).toHaveLength(1)
    expect(screens(engine)[0]).toContain('"home"')
    // The interrupted fade wrote to this card too, and only the newest run is
    // allowed to release it — so an abandoned transition cannot strand an
    // opacity on a screen the user is looking at.
    expect(cards(engine)[0]?.styles).toEqual(CARD_STYLE)
  })

  it('reaches the same tree whether a transition ran, was skipped, or was interrupted', async () => {
    // The rule the whole transition seam rests on: a transition is how a screen
    // arrives, never what it is. Three routes to the same settled tree, and the
    // interrupted one is the case most likely to regress — it is the only one
    // where a promise the stack stopped waiting for resolves afterwards.
    const push = (router: Router<Route>): void => {
      router.navigate('/settings')
    }
    const pushAndBack = (router: Router<Route>): void => {
      router.navigate('/settings')
      router.back()
    }

    expect(await settledTree(fadeTransition(), push)).toBe(await settledTree(undefined, push))
    expect(await settledTree(fadeTransition(), pushAndBack)).toBe(await settledTree(undefined, pushAndBack))
  })

  it('settles anyway when a transition rejects', async () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={router} transition={() => Promise.reject(new Error('boom'))} />)
    router.navigate('/settings')
    router.back()
    await Promise.resolve()
    await Promise.resolve()

    // A transition that threw is the app's bug. Refusing to settle would make
    // it this component's — a stack stuck showing two screens with a popped one
    // never disposed.
    expect(cards(engine)).toHaveLength(1)
    expect(screens(engine)[0]).toContain('"home"')
  })

  it('does not settle a stack that has since unmounted', async () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    const unmount = mount(engine.pageElement, () => <RouteStack router={router} transition={fadeTransition()} />)
    router.navigate('/settings')
    unmount()
    await runTransitions()

    // The container went with the unmount, and the transition resolving
    // afterwards found nothing to settle rather than reviving any of it.
    expect(engine.page.children).toHaveLength(0)
  })

  it('disposes every screen when the stack unmounts', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    let live = 0

    const counted: Route[] = [
      {
        path: '/',
        view: () => {
          live += 1
          onCleanup(() => {
            live -= 1
          })
          return <text>home</text>
        },
      },
      {
        path: '/settings',
        view: () => {
          live += 1
          onCleanup(() => {
            live -= 1
          })
          return <text>settings</text>
        },
      },
    ]
    const router = createRouter({ routes: counted, history: createMemoryHistory() })

    const unmount = mount(engine.pageElement, () => <RouteStack router={router} />)
    router.navigate('/settings')
    expect(live).toBe(2)

    unmount()
    expect(live).toBe(0)
  })

  it('positions its cards so two screens can overlap', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={router} />)

    // `position: relative` on the container is the load-bearing half: an
    // absolutely positioned card resolves against its nearest positioned
    // ancestor, and without this one the cards would escape the stack entirely.
    expect(containerOf(engine).styles).toMatchObject({ position: 'relative', flex: '1' })
    expect(cards(engine)[0]?.styles).toMatchObject(CARD_STYLE)
  })

  it('lays a caller style over its own positioning', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={router} style={{ backgroundColor: 'black' }} />)

    expect(containerOf(engine).styles).toMatchObject({ position: 'relative', 'background-color': 'black' })
  })

  it('keeps a reactive container style tracking after the merge', () => {
    // The merge that replaced `/ui`'s `mergeStyle` has one job beyond spreading:
    // a getter has to come back as a getter, or a live binding quietly becomes a
    // one-time write.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const colour = signal('black')
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(engine.pageElement, () => <RouteStack router={router} style={() => ({ backgroundColor: colour() })} />)
    colour('white')

    expect(containerOf(engine).styles).toMatchObject({ position: 'relative', 'background-color': 'white' })
  })
})
