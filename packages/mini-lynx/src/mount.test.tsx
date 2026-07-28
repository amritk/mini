import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from './engine/current-engine'
import type { LynxElement, LynxElementApi } from './engine/element-api'
import { clearWorklets } from './events/worklet-registry'
import { mount, pageElement } from './mount'
import { onCleanup } from './on-cleanup'
import { signal } from './signals'
import { createFakeEngine } from './testing/create-fake-engine'
import { serializeTree } from './testing/serialize-tree'

/**
 * The application root, and the two things only it can do: own a scope at the
 * top level, so a root component's effects and `onCleanup` registrations have
 * somewhere to live, and commit the tree synchronously — everything else in the
 * package can afford to wait for the end of the tick, and the first paint
 * cannot.
 */

const tick = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(async () => {
  await tick()
  clearEngine()
  clearWorklets()
})

describe('mount', () => {
  it('attaches the component tree to the container', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () => <text>hello</text>)

    expect(serializeTree(engine.page)).toBe(['<page>', '  <text>', '    <raw-text text="hello">'].join('\n'))
  })

  it('commits the tree synchronously', () => {
    // Not left to the scheduled flush. This is the first screen, and waiting for
    // the end of the tick to paint it is exactly the wait nobody should have to
    // sit through.
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () => <text>hello</text>)

    expect(engine.flushes()).toBe(1)
  })

  it('detaches the tree when disposed', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    const dispose = mount(engine.pageElement, () => <text>hello</text>)
    dispose()

    expect(engine.page.children).toHaveLength(0)
  })

  it('runs a top-level onCleanup on dispose', () => {
    // Without `mount` opening a scope there is no owner at the root, so a
    // top-level cleanup would have nothing to attach to and would never fire.
    const engine = createFakeEngine()
    setEngine(engine.api)
    let cleaned = false

    const dispose = mount(engine.pageElement, () => {
      onCleanup(() => {
        cleaned = true
      })
      return (<view />) as LynxElement
    })

    expect(cleaned).toBe(false)
    dispose()
    expect(cleaned).toBe(true)
  })

  it('stops the tree reacting once disposed', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const label = signal('before')
    let reads = 0

    const dispose = mount(engine.pageElement, () => (
      <text>
        {() => {
          reads++
          return label()
        }}
      </text>
    ))

    const afterMount = reads
    dispose()
    label('after')

    expect(reads).toBe(afterMount)
  })

  it('schedules a commit for the teardown', async () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const dispose = mount(engine.pageElement, () => <text>hello</text>)
    await tick()
    const afterMount = engine.flushes()

    dispose()
    await tick()

    expect(engine.flushes()).toBe(afterMount + 1)
  })

  it('mounts into any container, not only the page', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const container = (<view />) as LynxElement
    engine.api.__AppendElement(engine.pageElement, container)

    mount(container, () => <text>hello</text>)

    expect(serializeTree(engine.page)).toBe(
      ['<page>', '  <view>', '    <text>', '      <raw-text text="hello">'].join('\n'),
    )
  })

  it('hands back the page element the engine already owns', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    expect(pageElement()).toBe(engine.pageElement)
  })

  it('throws a readable error on an engine with no page element', () => {
    // An app is free to mount into an element it got some other way, so the
    // absence is legitimate — but an `undefined` crossing the boundary is not,
    // and it would surface as a null-ish crash deep inside `insert`.
    const engine = createFakeEngine()
    const { __GetPageElement: _absent, ...withoutPage } = engine.api
    setEngine(withoutPage satisfies LynxElementApi)

    expect(() => pageElement()).toThrow(/no page element/i)
  })

  it('throws before an engine is installed', () => {
    expect(() => pageElement()).toThrow(/No engine installed/)
  })
})
