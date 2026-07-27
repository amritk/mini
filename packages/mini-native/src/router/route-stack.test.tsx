import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, onCleanup, setHost, signal } from '../index'
import { createMemoryHistory } from './create-memory-history'
import { createRouter, type Route } from './create-router'
import { RouteStack } from './route-stack'
import { fadeTransition } from './stack-transition'

afterEach(() => {
  clearHost()
})

const routes: Route[] = [
  { path: '/', view: () => <text>home</text> },
  { path: '/users/:id', view: (params) => <text>{() => `user ${params()['id']}`}</text> },
  { path: '/settings', view: () => <text>settings</text> },
]

/** The cards, in tree order — bottom of the stack first. */
const cards = (memory: ReturnType<typeof createMemoryHost>): MemoryElement[] => {
  const container = memory.root.children[0] as MemoryElement
  return container.children as MemoryElement[]
}

/** What each card holds, as text, so a whole stack reads as one assertion. */
const screens = (memory: ReturnType<typeof createMemoryHost>): string[] =>
  cards(memory).map((card) => serializeMemoryTree(card).replace(/\s+/g, ' '))

describe('route-stack', () => {
  it('renders the screen it starts on', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(memory.rootElement, () => <RouteStack router={router} />)

    expect(cards(memory)).toHaveLength(1)
    expect(serializeMemoryTree(memory.root)).toContain('"home"')
  })

  it('pushes a screen over the one it came from', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(memory.rootElement, () => <RouteStack router={router} />)
    router.navigate('/users/1')

    // Both screens are built; only the top one is showing.
    const built = screens(memory)
    expect(built).toHaveLength(2)
    expect(built[0]).toContain('"home"')
    expect(built[1]).toContain('"user 1"')
    expect(cards(memory)[0]?.visible).toBe(false)
    expect(cards(memory)[1]?.visible).toBe(true)
  })

  it('keeps a buried screen alive rather than tearing it down', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
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

    mount(memory.rootElement, () => <RouteStack router={router} />)
    router.navigate('/settings')

    // The screen underneath was never disposed, and its bindings still run —
    // which is the whole reason a stack keeps them: a scroll position and a
    // half-filled form are still there on the way back.
    expect(disposed).toBe(0)
    label('second')
    expect(screens(memory)[0]).toContain('"second"')
  })

  it('pops back to the screen it left, without rebuilding it', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
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

    mount(memory.rootElement, () => <RouteStack router={counting} />)
    counting.navigate('/settings')
    counting.back()

    expect(cards(memory)).toHaveLength(1)
    expect(serializeMemoryTree(memory.root)).toContain('"home"')
    expect(built).toBe(1)
    expect(counting.route().path).toBe('/')
  })

  it('updates params in place when the route did not change', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const router = createRouter({ routes, history: createMemoryHistory({ path: '/users/1', search: '' }) })

    mount(memory.rootElement, () => <RouteStack router={router} />)
    router.navigate('/users/2', { replace: true })

    // A replace is not a step, so this is one screen reporting new params —
    // the same thing `RouteView` does.
    expect(cards(memory)).toHaveLength(1)
    expect(screens(memory)[0]).toContain('"user 2"')
  })

  it('pushes a second screen for the same route when it was not a replace', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const router = createRouter({ routes, history: createMemoryHistory({ path: '/users/1', search: '' }) })

    mount(memory.rootElement, () => <RouteStack router={router} />)
    router.navigate('/users/2')

    // The distinction the matched route cannot make and the depth can.
    const built = screens(memory)
    expect(built).toHaveLength(2)
    expect(built[0]).toContain('"user 1"')
    expect(built[1]).toContain('"user 2"')
  })

  it('swaps the top screen for a replace onto a different route', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(memory.rootElement, () => <RouteStack router={router} />)
    router.navigate('/settings', { replace: true })

    expect(cards(memory)).toHaveLength(1)
    expect(screens(memory)[0]).toContain('"settings"')
  })

  it('pops every screen a multi-step back skipped over', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const history = createMemoryHistory()
    const router = createRouter({ routes, history })

    mount(memory.rootElement, () => <RouteStack router={router} />)
    router.navigate('/users/1')
    router.navigate('/users/2')
    router.navigate('/settings')
    expect(cards(memory)).toHaveLength(4)

    history.back()
    history.back()
    history.back()

    expect(cards(memory)).toHaveLength(1)
    expect(screens(memory)[0]).toContain('"home"')
  })

  it('renders the fallback for a location that matched nothing', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(memory.rootElement, () => <RouteStack router={router} fallback={() => <text>missing</text>} />)
    router.navigate('/nope')

    expect(screens(memory)[1]).toContain('"missing"')
  })

  it('holds the outgoing screen until the transition finishes', async () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const history = createMemoryHistory()
    const router = createRouter({ routes, history })

    mount(memory.rootElement, () => <RouteStack router={router} transition={fadeTransition()} />)
    router.navigate('/settings')
    router.back()

    // The popped screen is still in the tree, mid-fade: removing it up front
    // would tear it out from under the animation that is moving it.
    expect(cards(memory)).toHaveLength(2)
    // Two per change — the one arriving and the one leaving — for the push and
    // then for the pop.
    expect(memory.animations).toHaveLength(4)

    for (const animation of memory.animations) animation.finish()
    await Promise.resolve()
    await Promise.resolve()

    expect(cards(memory)).toHaveLength(1)
    expect(screens(memory)[0]).toContain('"home"')
  })

  it('settles the tree even when a transition is cut short by the next navigation', async () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(memory.rootElement, () => <RouteStack router={router} transition={fadeTransition()} />)
    router.navigate('/settings')
    // Interrupts the push transition, which never resolves.
    router.back()
    for (const animation of memory.animations) animation.finish()
    await Promise.resolve()
    await Promise.resolve()

    expect(cards(memory)).toHaveLength(1)
    expect(screens(memory)[0]).toContain('"home"')
  })

  it('ends up in the same tree with a transition as without one', async () => {
    const build = async (transition?: ReturnType<typeof fadeTransition>): Promise<string> => {
      const memory = createMemoryHost()
      setHost(memory.host)
      const router = createRouter({ routes, history: createMemoryHistory() })
      mount(memory.rootElement, () => <RouteStack router={router} {...(transition ? { transition } : {})} />)
      router.navigate('/settings')
      for (const animation of memory.animations) animation.finish()
      await Promise.resolve()
      await Promise.resolve()
      clearHost()
      return serializeMemoryTree(memory.root)
    }

    // The rule the whole animation seam rests on: an animation is how a screen
    // arrives, never what it is. A host that cannot animate must reach the tree
    // a host that can does.
    expect(await build()).toBe(await build(fadeTransition()))
  })

  it('settles anyway when a transition rejects', async () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(memory.rootElement, () => <RouteStack router={router} transition={() => Promise.reject(new Error('boom'))} />)
    router.navigate('/settings')
    router.back()
    await Promise.resolve()
    await Promise.resolve()

    // A transition that threw is the app's bug. Refusing to settle would make
    // it this component's — a stack stuck showing two screens with a popped one
    // never disposed.
    expect(cards(memory)).toHaveLength(1)
    expect(screens(memory)[0]).toContain('"home"')
  })

  it('does not settle a stack that has since unmounted', async () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const router = createRouter({ routes, history: createMemoryHistory() })

    const unmount = mount(memory.rootElement, () => <RouteStack router={router} transition={fadeTransition()} />)
    router.navigate('/settings')
    unmount()
    for (const animation of memory.animations) animation.finish()
    await Promise.resolve()
    await Promise.resolve()

    // The container went with the unmount, and the transition resolving
    // afterwards found nothing to settle rather than reviving any of it.
    expect(memory.root.children).toHaveLength(0)
  })

  it('disposes every screen when the stack unmounts', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
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

    const unmount = mount(memory.rootElement, () => <RouteStack router={router} />)
    router.navigate('/settings')
    expect(live).toBe(2)

    unmount()
    expect(live).toBe(0)
  })

  it('positions its cards so two screens can overlap', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(memory.rootElement, () => <RouteStack router={router} />)

    const container = memory.root.children[0] as MemoryElement
    expect(container.style).toMatchObject({ position: 'relative', flex: 1 })
    expect((container.children[0] as MemoryElement).style).toMatchObject({
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    })
  })

  it('lays a caller style over its own positioning', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const router = createRouter({ routes, history: createMemoryHistory() })

    mount(memory.rootElement, () => <RouteStack router={router} style={{ backgroundColor: 'black' }} />)

    const container = memory.root.children[0] as MemoryElement
    expect(container.style).toMatchObject({ position: 'relative', backgroundColor: 'black' })
  })
})
