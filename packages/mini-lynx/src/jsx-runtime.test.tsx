import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from './engine/current-engine'
import type { LynxElement } from './engine/element-api'
import { clearWorklets } from './events/worklet-registry'
import { jsx, jsxDEV, jsxs } from './jsx-runtime'
import { signal } from './signals'
import { createFakeEngine, type FakeElement, type FakeEngine } from './testing/create-fake-engine'
import { serializeTree } from './testing/serialize-tree'
import { insert } from './tree'

/**
 * JSX here produces REAL LYNX ELEMENTS, immediately, exactly once. There is no
 * virtual tree, no diffing and no re-render, so everything worth asserting is
 * about that word "once" — an element built once, a component called once, a
 * static prop written once — plus the one place a value is allowed to keep
 * changing: a getter.
 */

const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

/** The in-memory node behind an opaque handle. */
const fake = (element: LynxElement): FakeElement => element as unknown as FakeElement

/** Installs a fresh engine, mounts what `build` returns, and hands back the page. */
const render = (build: () => LynxElement): FakeEngine => {
  const engine = createFakeEngine()
  setEngine(engine.api)
  insert(engine.pageElement, build(), null)
  return engine
}

afterEach(async () => {
  await tick()
  clearEngine()
  clearWorklets()
})

describe('jsx-runtime', () => {
  it('builds a tree of real engine elements', () => {
    const engine = render(() => (
      <view class="card">
        <text>hello</text>
      </view>
    ))

    expect(serializeTree(engine.page)).toBe(
      ['<page>', '  <view .card>', '    <text>', '      <raw-text text="hello">'].join('\n'),
    )
  })

  it('creates each element exactly once', () => {
    // The whole premise. A second create for the same element would mean a
    // virtual tree had crept in somewhere.
    const engine = render(() => (
      <view>
        <text>a</text>
      </view>
    ))
    const creates = engine.calls().filter((line) => line.startsWith('__CreateElement'))

    expect(creates).toHaveLength(2)
    expect(creates[0]).toContain('"text"')
    expect(creates[1]).toContain('"view"')
    // And the owning id is the page's, never zero. Zero is out of range on a
    // real engine, and an element created with it renders while dropping out of
    // class, id and tag selector resolution — a whole styling channel gone with
    // nothing to indicate why.
    expect(creates.some((line) => line.includes(', 0)'))).toBe(false)
  })

  it('applies a static prop once and never again', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const busy = signal(true)

    // mini-static-ok: freezing the signal is the behaviour under test
    const frozen = (<view class={busy() ? 'busy' : 'idle'} />) as LynxElement
    busy(false)

    expect(fake(frozen).classes).toBe('busy')
  })

  it('tracks a getter-valued prop forever', () => {
    // Passing the signal itself binds live; calling it reads once. That pair is
    // the one footgun of a compilerless JSX, so both halves are pinned.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const busy = signal(true)

    const tracked = (<view class={() => (busy() ? 'busy' : 'idle')} />) as LynxElement
    expect(fake(tracked).classes).toBe('busy')

    busy(false)

    expect(fake(tracked).classes).toBe('idle')
  })

  it('treats a function child as a reactive text binding', () => {
    const count = signal(2)
    const engine = render(() => <text>{() => `count ${count()}`}</text>)

    expect(serializeTree(engine.page)).toContain('text="count 2"')

    count(7)

    expect(serializeTree(engine.page)).toContain('text="count 7"')
  })

  it('calls ref only once the element is fully built', () => {
    // A callback that saw a half-populated node would be worse than no callback
    // at all, because the tree it inspects would be right most of the time.
    let childrenAtRef = -1
    let classAtRef: string | null = null
    render(() => (
      <view
        class="card"
        ref={(element) => {
          childrenAtRef = fake(element).children.length
          classAtRef = fake(element).classes
        }}
      >
        <text>a</text>
        <text>b</text>
      </view>
    ))

    expect(childrenAtRef).toBe(2)
    expect(classAtRef).toBe('card')
  })

  it('never sends ref to the engine as an attribute', () => {
    const engine = render(() => <view ref={() => {}} />)

    expect('ref' in (engine.find('view') as FakeElement).attrs).toBe(false)
  })

  it('ignores key on an element', () => {
    // JSX reserves the name and the transform hoists it out of props before the
    // runtime sees it. There is no keying at the JSX level here at all —
    // reconciliation lives in `list`.
    const engine = render(() => <view key="row-1" class="card" />)
    const view = engine.find('view') as FakeElement

    expect('key' in view.attrs).toBe(false)
    expect(view.elementId).toBeNull()
    expect(view.classes).toBe('card')
  })

  it('forwards key back into props for a component', () => {
    // The transform hoists `key` out of the props object BEFORE the component is
    // ever called, so a component with a legitimate prop of that name — `For`,
    // whose `key` is the row identity function — would silently never receive
    // it. That shows up as rows mysteriously not updating rather than as an
    // error.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const seen: unknown[] = []
    const Row = (props: { key?: unknown }): LynxElement => {
      seen.push(props.key)
      return (<view />) as LynxElement
    }

    jsx(Row as never, {}, 'row-1')

    expect(seen).toEqual(['row-1'])
  })

  it('leaves props untouched for a component with no key', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    let received: object | null = null
    const Row = (props: object): LynxElement => {
      received = props
      return (<view />) as LynxElement
    }
    const props = { label: 'hi' }

    jsx(Row as never, props)

    expect(received).toBe(props)
  })

  it('runs a component exactly once', () => {
    // There is no instance and no lifecycle. Whatever reactivity a component
    // sets up internally is the only thing that ever updates after.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const label = signal('before')
    let calls = 0
    const Row = (): LynxElement => {
      calls++
      return (<text>{() => label()}</text>) as LynxElement
    }

    const row = (<Row />) as LynxElement
    label('after')
    label('later')

    expect(calls).toBe(1)
    expect(fake(row).children[0]?.attrs['text']).toBe('later')
  })

  it('wires an event prop with the engine own spelling', () => {
    const taps: number[] = []
    const engine = render(() => <view bindtap={() => taps.push(1)} />)
    const view = engine.find('view') as FakeElement

    engine.dispatch(view, 'tap')
    engine.dispatch(view, 'tap')

    expect(taps).toHaveLength(2)
  })

  it('toggles visibility through show without detaching the element', () => {
    // The whole difference between the `show` prop and the `Show` component:
    // hiding keeps the subtree alive, so a half-typed input or a scroll position
    // survives being hidden and shown.
    const visible = signal(true)
    const engine = render(() => <view show={visible} />)
    const view = engine.find('view') as FakeElement

    visible(false)

    expect(view.styles['display']).toBe('none')
    expect(engine.page.children).toHaveLength(1)
  })

  it('drops nullish and boolean children so && conditionals work', () => {
    const show = false
    const engine = render(() => (
      <view>
        {null}
        {undefined}
        {show && <text>hidden</text>}
        <text>kept</text>
      </view>
    ))

    expect((engine.find('view') as FakeElement).children).toHaveLength(1)
  })

  it('is the element, so a JSX expression can be passed straight on', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    const element = (<view />) as LynxElement

    expect(fake(element).tag).toBe('view')
  })

  it('commits the tree at the end of the tick', async () => {
    const engine = render(() => <view />)

    expect(engine.flushes()).toBe(0)
    await tick()
    expect(engine.flushes()).toBe(1)
  })

  it('shares one implementation across jsx, jsxs and jsxDEV', () => {
    // `jsxs` is the multi-children variant and `jsx` already handles arrays, so
    // there is nothing for a second implementation to do. `jsxDEV`'s extra debug
    // parameters have nothing to attach to in a runtime with no component
    // instances, so they are accepted and dropped.
    const engine = createFakeEngine()
    setEngine(engine.api)

    expect(jsxs).toBe(jsx)

    const element = jsxDEV('view', { class: 'card' }, undefined, false, { fileName: 'x.tsx' }, undefined)

    expect(fake(element).classes).toBe('card')
  })
})
