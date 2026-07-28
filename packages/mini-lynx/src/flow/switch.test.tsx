import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, mount, onCleanup, setEngine, signal } from '../index'
import { createFakeEngine, type FakeElement, type FakeEngine } from '../testing/create-fake-engine'
import { Match } from './match'
import { Switch } from './switch'

afterEach(() => {
  clearEngine()
})

/**
 * Every run of text currently in the tree, in document order.
 *
 * Asserting the whole list rather than searching for a substring is what makes
 * "only the winning branch is mounted" testable in one expectation: the losing
 * branches show up as entries that should not be there.
 */
const texts = (engine: FakeEngine): string[] => engine.findAll('raw-text').map((node) => String(node.attrs['text']))

/** The wrapper `Switch` owns its slot in, which is the mounted tree's only child. */
const wrapperOf = (engine: FakeEngine): FakeElement => engine.page.children[0] as FakeElement

describe('switch', () => {
  it('renders the first branch whose condition is truthy', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const status = signal<'loading' | 'error' | 'ready'>('ready')

    mount(engine.pageElement, () => (
      <Switch>
        <Match when={() => status() === 'loading'}>{() => <text>spinner</text>}</Match>
        <Match when={() => status() === 'error'}>{() => <text>oops</text>}</Match>
        <Match when={() => status() === 'ready'}>{() => <text>done</text>}</Match>
      </Switch>
    ))

    expect(texts(engine)).toEqual(['done'])
    status('loading')
    expect(texts(engine)).toEqual(['spinner'])
    status('error')
    expect(texts(engine)).toEqual(['oops'])
  })

  it('owns its slot with a wrapper rather than a real box', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () => (
      <Switch>
        <Match when={true}>{() => <text>done</text>}</Match>
      </Switch>
    ))

    expect(wrapperOf(engine).tag).toBe('wrapper')
  })

  it('honours branch order when several conditions are truthy', () => {
    // Order is the whole priority rule, so two truthy branches must resolve to
    // the one written first rather than to whichever happens to be checked last.
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () => (
      <Switch>
        <Match when={true}>{() => <text>first</text>}</Match>
        <Match when={true}>{() => <text>second</text>}</Match>
      </Switch>
    ))

    expect(texts(engine)).toEqual(['first'])
  })

  it('falls through to the fallback when no branch matches', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const ready = signal(false)

    mount(engine.pageElement, () => (
      <Switch fallback={() => <text>nothing matched</text>}>
        <Match when={ready}>{() => <text>ready</text>}</Match>
      </Switch>
    ))

    expect(texts(engine)).toEqual(['nothing matched'])
    ready(true)
    expect(texts(engine)).toEqual(['ready'])
  })

  it('renders nothing when no branch matches and there is no fallback', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () => (
      <Switch>
        <Match when={false}>{() => <text>never</text>}</Match>
      </Switch>
    ))

    // The wrapper element still exists; it is simply empty.
    expect(wrapperOf(engine).children).toHaveLength(0)
  })

  it('never builds the losing branches', () => {
    // This is the point of Switch over a stack of Shows: the branches are often
    // whole screens, and building the ones nobody is looking at would mean real
    // element trees being created and committed for nothing.
    const engine = createFakeEngine()
    setEngine(engine.api)
    const status = signal<'loading' | 'ready'>('loading')
    let loadingBuilds = 0
    let readyBuilds = 0

    mount(engine.pageElement, () => (
      <Switch fallback={() => <text>idle</text>}>
        <Match when={() => status() === 'loading'}>
          {() => {
            loadingBuilds += 1
            return <text>spinner</text>
          }}
        </Match>
        <Match when={() => status() === 'ready'}>
          {() => {
            readyBuilds += 1
            return <text>done</text>
          }}
        </Match>
      </Switch>
    ))

    expect(loadingBuilds).toBe(1)
    expect(readyBuilds).toBe(0)

    status('ready')
    expect(loadingBuilds).toBe(1)
    expect(readyBuilds).toBe(1)
  })

  it('tears the losing branch down so it stops reacting', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const status = signal<'loading' | 'ready'>('loading')
    let cleaned = false

    mount(engine.pageElement, () => (
      <Switch>
        <Match when={() => status() === 'loading'}>
          {() => {
            onCleanup(() => {
              cleaned = true
            })
            return <text>spinner</text>
          }}
        </Match>
        <Match when={() => status() === 'ready'}>{() => <text>done</text>}</Match>
      </Switch>
    ))

    expect(cleaned).toBe(false)
    status('ready')
    expect(cleaned).toBe(true)
  })

  it('skips children that are not Match branches', () => {
    // JSX hands whitespace and conditional nulls through as children, and a
    // Switch that choked on them would be unusable in real markup.
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () => (
      <Switch>
        {null} <Match when={true}>{() => <text>real</text>}</Match>
      </Switch>
    ))

    expect(texts(engine)).toEqual(['real'])
  })
})
