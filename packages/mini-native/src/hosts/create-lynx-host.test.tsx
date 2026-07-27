import { afterEach, describe, expect, it, vi } from 'vitest'

import { For } from '../flow'
import type { HostElement } from '../index'
import { clearHost, mount, setHost, signal } from '../index'
import { createLynxHost, lynxRoot } from './create-lynx-host'
import type { LynxElement, LynxElementApi } from './lynx-element-api'

/** A node in the fake engine tree. Mirrors the shape the real PAPI maintains. */
type FakeElement = {
  tag: string
  attrs: Record<string, unknown>
  styles: Record<string, string>
  classes: string
  events: Map<string, ((event: unknown) => void) | null>
  children: FakeElement[]
  parent: FakeElement | null
}

type FakeEngine = {
  api: LynxElementApi
  root: FakeElement
  /** How many times the tree has been committed, for asserting flush coalescing. */
  flushes: () => number
}

/**
 * A stand-in for the Lynx engine.
 *
 * The whole reason `createLynxHost` takes its PAPI as an argument is so this can
 * exist: the adapter's mapping is verified here in full — element creation,
 * text representation, event registration, tree surgery — with no engine, no
 * device, and no emulator anywhere in the loop.
 */
const createFakeEngine = (): FakeEngine => {
  let flushes = 0

  const element = (tag: string): FakeElement => ({
    tag,
    attrs: {},
    styles: {},
    classes: '',
    events: new Map(),
    children: [],
    parent: null,
  })

  const root = element('page')

  const api: LynxElementApi = {
    __CreateElement: (tag) => toLynx(element(tag)),
    __SetAttribute: (el, name, value) => {
      const target = fromLynx(el)
      if (value === null) delete target.attrs[name]
      else target.attrs[name] = value
    },
    __GetAttributes: (el) => fromLynx(el).attrs,
    __SetInlineStyles: (el, styles) => {
      fromLynx(el).styles = typeof styles === 'string' ? {} : { ...styles }
    },
    __AddInlineStyle: (el, name, value) => {
      fromLynx(el).styles[name] = String(value)
    },
    __SetClasses: (el, classes) => {
      fromLynx(el).classes = classes
    },
    __AppendElement: (parent, child) => {
      const target = fromLynx(parent)
      const node = fromLynx(child)
      target.children.push(node)
      node.parent = target
    },
    __InsertElementBefore: (parent, child, anchor) => {
      const target = fromLynx(parent)
      const node = fromLynx(child)
      const at = target.children.indexOf(fromLynx(anchor))
      target.children.splice(at === -1 ? target.children.length : at, 0, node)
      node.parent = target
    },
    __RemoveElement: (parent, child) => {
      const target = fromLynx(parent)
      const node = fromLynx(child)
      const at = target.children.indexOf(node)
      if (at !== -1) target.children.splice(at, 1)
      node.parent = null
    },
    __GetParent: (el) => {
      const parent = fromLynx(el).parent
      return parent === null ? null : toLynx(parent)
    },
    __GetChildren: (el) => fromLynx(el).children.map(toLynx),
    __FirstElement: (el) => {
      const first = fromLynx(el).children[0]
      return first === undefined ? null : toLynx(first)
    },
    __NextElement: (el) => {
      const node = fromLynx(el)
      const siblings = node.parent?.children
      if (!siblings) return null
      const next = siblings[siblings.indexOf(node) + 1]
      return next === undefined ? null : toLynx(next)
    },
    __AddEvent: (el, type, name, listener) => {
      fromLynx(el).events.set(`${type}:${name}`, listener)
    },
    __FlushElementTree: () => {
      flushes++
    },
  }

  return { api, root, flushes: () => flushes }
}

const toLynx = (node: FakeElement): LynxElement => node as unknown as LynxElement
const fromLynx = (node: LynxElement): FakeElement => node as unknown as FakeElement

/**
 * Looks behind the opaque handle the host hands back, so a test can assert on
 * what the fake engine actually recorded.
 */
const asFake = (node: HostElement): FakeElement => node as unknown as FakeElement

/** Installs the Lynx host over a fresh fake engine and returns both. */
const setup = (): FakeEngine => {
  const engine = createFakeEngine()
  setHost(createLynxHost(engine.api))
  return engine
}

/** Fires whatever dispatcher the host registered for an event name. */
const fire = (element: FakeElement, name: string, event: unknown = {}): void => {
  element.events.get(`bindEvent:${name}`)?.(event)
}

afterEach(() => {
  clearHost()
})

describe('create-lynx-host', () => {
  it('creates elements under component id zero', () => {
    const engine = setup()
    mount(lynxRoot(toLynx(engine.root)), () => <view />)

    expect(engine.root.children[0]?.tag).toBe('view')
  })

  it('represents text as a raw-text element carrying a text attribute', () => {
    const engine = setup()
    mount(lynxRoot(toLynx(engine.root)), () => <text>hello</text>)

    const raw = engine.root.children[0]?.children[0]
    expect(raw?.tag).toBe('raw-text')
    expect(raw?.attrs['text']).toBe('hello')
  })

  it('updates text in place when the signal it reads changes', () => {
    const engine = setup()
    const name = signal('sam')
    mount(lynxRoot(toLynx(engine.root)), () => <text>{() => `hi ${name()}`}</text>)

    const raw = engine.root.children[0]?.children[0]
    expect(raw?.attrs['text']).toBe('hi sam')
    name('alex')
    expect(raw?.attrs['text']).toBe('hi alex')
  })

  it('routes class through SetClasses rather than an attribute', () => {
    // Classes are not attributes in Lynx, so passing them through
    // `__SetAttribute` would set something the engine simply ignores.
    const engine = setup()
    mount(lynxRoot(toLynx(engine.root)), () => <view class={['card', 'wide']} />)

    const view = engine.root.children[0]
    expect(view?.classes).toBe('card wide')
    expect(view?.attrs['class']).toBeUndefined()
  })

  it('fans out to every listener despite the engine keeping only one', () => {
    // Lynx overwrites a listener when a second is registered for the same
    // event. The host registers one dispatcher and fans out itself, so callers
    // get the add-many behaviour every other host provides.
    const engine = setup()
    const calls: string[] = []
    const host = createLynxHost(engine.api)
    const element = host.createElement('view')

    host.addEventListener(element, 'tap', () => calls.push('first'))
    host.addEventListener(element, 'tap', () => calls.push('second'))
    fire(asFake(element), 'tap')

    expect(calls).toEqual(['first', 'second'])
  })

  it('keeps the remaining listeners when one detaches', () => {
    const engine = setup()
    const calls: string[] = []
    const host = createLynxHost(engine.api)
    const element = host.createElement('view')

    const detach = host.addEventListener(element, 'tap', () => calls.push('first'))
    host.addEventListener(element, 'tap', () => calls.push('second'))
    detach()
    fire(asFake(element), 'tap')

    expect(calls).toEqual(['second'])
  })

  it('unregisters the dispatcher once the last listener detaches', () => {
    const engine = setup()
    const host = createLynxHost(engine.api)
    const element = host.createElement('view')

    const detach = host.addEventListener(element, 'tap', () => undefined)
    detach()

    // A null listener is how Lynx is told to drop the registration, so the
    // engine stops calling into an empty handler set on every gesture.
    expect(asFake(element).events.get('bindEvent:tap')).toBeNull()
  })

  it('hides an element by setting display none and restores it to flex', () => {
    const engine = setup()
    const visible = signal(true)
    mount(lynxRoot(toLynx(engine.root)), () => <view show={visible} />)

    const view = engine.root.children[0]
    expect(view?.styles['display']).toBe('flex')
    visible(false)
    expect(view?.styles['display']).toBe('none')
  })

  it('detaches a node from its old parent when inserting it elsewhere', () => {
    const engine = setup()
    const host = createLynxHost(engine.api)
    const first = host.createElement('view')
    const second = host.createElement('view')
    const child = host.createElement('text')

    host.insert(first, child, null)
    host.insert(second, child, null)

    // Without the detach, the node would end up listed under both parents,
    // which is exactly what a list reorder would trigger.
    expect(fromLynx(first as unknown as LynxElement).children).toHaveLength(0)
    expect(fromLynx(second as unknown as LynxElement).children).toHaveLength(1)
  })

  it('coalesces a burst of mutations into a single commit', async () => {
    const engine = setup()
    const count = signal(0)
    mount(lynxRoot(toLynx(engine.root)), () => <text>{() => String(count())}</text>)

    await Promise.resolve()
    const afterMount = engine.flushes()

    count(1)
    count(2)
    count(3)
    await Promise.resolve()

    // Three writes, one commit. On a batching engine the alternative is a
    // whole-tree commit per attribute, which is the difference between a cheap
    // update and a stutter.
    expect(engine.flushes()).toBe(afterMount + 1)
  })
})

/**
 * The other half of the semantics layer. The DOM host picks an ELEMENT from a
 * role; a native tree has one container view, so here the same prop is a flat
 * rename onto Lynx's `accessibility-*` attributes. Asserting the mapping
 * against a fake engine is what keeps correcting it for a given engine version
 * a one-line edit with a test that says whether it took.
 */
describe('create-lynx-host accessibility', () => {
  it('maps the accessibility props onto engine attributes', () => {
    const engine = setup()
    mount(lynxRoot(toLynx(engine.root)), () => (
      <view role="button" label="save" hint="writes to disk" disabled={true} />
    ))

    expect(engine.root.children[0]?.attrs).toMatchObject({
      'accessibility-role': 'button',
      'accessibility-label': 'save',
      'accessibility-hint': 'writes to disk',
      'accessibility-disabled': true,
    })
  })

  it('keeps the flow wrapper out of the accessibility tree', () => {
    const engine = setup()
    mount(lynxRoot(toLynx(engine.root)), () => (
      <view role="list">
        <For each={[1]}>{() => <view role="listitem" />}</For>
      </view>
    ))

    // A container view is an entirely ordinary node here, which is exactly why
    // it would otherwise sit between the list and its items in the
    // accessibility tree. Same invariant as the DOM host, different spelling.
    const wrapper = engine.root.children[0]?.children[0]
    expect(wrapper?.attrs['accessibility-element']).toBe(false)
  })

  it('carries role and level as attributes, since native has no tag to choose', () => {
    const engine = setup()
    mount(lynxRoot(toLynx(engine.root)), () => (
      <text role="heading" level={2}>
        Pricing
      </text>
    ))

    // The DOM host builds an <h2> and drops the level as redundant. There is no
    // heading element here, so both facts have to survive as attributes.
    const heading = engine.root.children[0]
    expect(heading?.tag).toBe('text')
    expect(heading?.attrs).toMatchObject({ 'accessibility-role': 'heading', 'accessibility-level': 2 })
  })
})

/** Fires an event on the first element the mount created. */
const fireChild = (engine: FakeEngine, name: string, event: unknown): void => {
  const child = engine.root.children[0]
  if (child) fire(child, name, event)
}

/**
 * The same normalisation from the other side. The engine keeps a gesture's
 * position under `detail` and a scroll offset in its own fields; reconciling
 * that here is what makes one handler mean the same thing on both targets.
 */
describe('create-lynx-host events', () => {
  it('normalises a gesture position out of the engine payload', () => {
    const engine = setup()
    let seen: { x?: number; y?: number } | null = null
    mount(lynxRoot(toLynx(engine.root)), () => <view onTap={(event) => (seen = event)} />)

    fireChild(engine, 'tap', { detail: { x: 12, y: 34 } })

    // Different words for the same two numbers the DOM host reads off a
    // MouseEvent, which is the whole point of the host owning this.
    expect(seen).toMatchObject({ x: 12, y: 34 })
  })

  it('reports no position when the engine sent none', () => {
    const engine = setup()
    let seen: unknown = null
    mount(lynxRoot(toLynx(engine.root)), () => <view onTap={(event) => (seen = event)} />)

    fireChild(engine, 'tap', {})

    // An accessibility action can activate an element without touching it, here
    // as much as on the web.
    expect((seen as { x?: number }).x).toBeUndefined()
  })

  it('normalises a scroll offset', () => {
    const engine = setup()
    let seen: { x: number; y: number } | null = null
    mount(lynxRoot(toLynx(engine.root)), () => <scroll-view onScroll={(event) => (seen = event)} />)

    fireChild(engine, 'scroll', { scrollLeft: 0, scrollTop: 200 })

    expect(seen).toMatchObject({ x: 0, y: 200 })
  })

  it('normalises the engine touch stream into one pointer handler', () => {
    const engine = setup()
    const phases: string[] = []
    mount(lynxRoot(toLynx(engine.root)), () => <view onPointer={(event) => phases.push(event.phase)} />)

    fireChild(engine, 'touchstart', { detail: { identifier: 1, x: 5, y: 5 } })
    fireChild(engine, 'touchmove', { detail: { identifier: 1, x: 20, y: 5 } })
    fireChild(engine, 'touchend', { detail: { identifier: 1, x: 40, y: 5 } })

    // Four engine events, one vocabulary event with a phase — which is what
    // lets the recognisers in `/gestures` be arithmetic rather than a mapping
    // table per target.
    expect(phases).toEqual(['down', 'move', 'up'])
  })

  it('reads a touch out of a touches list as well as out of detail', () => {
    const engine = setup()
    let seen: { id: number; x: number; y: number } | null = null
    mount(lynxRoot(toLynx(engine.root)), () => <view onPointer={(event) => (seen = event)} />)

    fireChild(engine, 'touchstart', { touches: [{ identifier: 7, x: 12, y: 34 }] })

    // Which field the engine uses is the part most likely to differ per engine
    // version, which is exactly why the fake asserts both shapes.
    expect(seen).toMatchObject({ id: 7, x: 12, y: 34 })
  })

  it('leaves an event the vocabulary does not name alone', () => {
    const engine = setup()
    const host = createLynxHost(engine.api)
    setHost(host)
    const view = host.createElement('view')
    let seen: unknown = null
    host.addEventListener(view, 'swipe', (event) => {
      seen = event
    })

    const payload = { direction: 'left' }
    fire(asFake(view), 'swipe', payload)

    expect(seen).toBe(payload)
  })
})

/**
 * The animation seam, wired through the host rather than exercised in isolation.
 *
 * `lynx-transition-animator.test.ts` covers what the animator does with the
 * PAPI. What is worth checking HERE is the join: the animator ends by asking the
 * host to put the element back the way its own `style` prop says, and only the
 * host knows what that is. Get that wrong and an animation permanently strips
 * whatever the element was styled with — a failure that appears one frame after
 * the animation ends, which is the worst possible place to look for it.
 */
describe('create-lynx-host animation', () => {
  it('releases the element back to its own style bag', async () => {
    vi.useFakeTimers()
    try {
      const engine = createFakeEngine()
      // The SAME host instance that rendered the element, which is the whole
      // point: what an element's own style bag is, is something this host
      // remembers per element rather than something the engine can be asked.
      const host = createLynxHost(engine.api)
      setHost(host)
      mount(lynxRoot(toLynx(engine.root)), () => <view style={{ opacity: 1, width: 100 }} />)
      const view = engine.root.children[0] as FakeElement

      const running = host.animate?.(view as unknown as HostElement, [{ opacity: 0 }, { opacity: 1 }], {
        duration: 200,
      })
      await vi.runAllTimersAsync()
      await running?.finished

      // Not merely "opacity is 1 again" — the whole bag is back, and the
      // transition the animator added is gone with it.
      expect(view.styles).toEqual({ opacity: '1', width: '100px' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not un-hide an element that `show` had hidden', async () => {
    vi.useFakeTimers()
    try {
      const engine = createFakeEngine()
      const host = createLynxHost(engine.api)
      setHost(host)
      const visible = signal(false)
      mount(lynxRoot(toLynx(engine.root)), () => <view show={visible} style={{ opacity: 1 }} />)
      const view = engine.root.children[0] as FakeElement

      const running = host.animate?.(view as unknown as HostElement, [{ opacity: 0 }, { opacity: 1 }], {
        duration: 200,
      })
      await vi.runAllTimersAsync()
      await running?.finished

      // The same invariant a plain `setStyle` has to keep, reached by a second
      // route. Releasing an animation rewrites the inline styles wholesale, so
      // it is exactly the operation that would quietly show a hidden element.
      expect(view.styles['display']).toBe('none')
    } finally {
      vi.useRealTimers()
    }
  })

  it('prefers an engine-native animator when one is supplied', () => {
    const engine = createFakeEngine()
    const asked: number[] = []
    const host = createLynxHost(engine.api, {
      animate: (_element, _keyframes, timing) => {
        asked.push(timing.duration)
        return { finish: () => {}, cancel: () => {}, finished: Promise.resolve('finished') }
      },
    })

    host.animate?.(toLynx(engine.root) as unknown as HostElement, [{ opacity: 0 }, { opacity: 1 }], { duration: 42 })

    // The transition-based default is the most the declared PAPI can express,
    // not a claim that nothing better exists. An engine build with a real
    // animation API should win outright.
    expect(asked).toEqual([42])
  })
})
