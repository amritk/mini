import { afterEach, describe, expect, it } from 'vitest'

import { Show } from '../flow'
import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { serializeMemoryTree } from '../hosts/serialize-memory-tree'
import { clearHost, mount, setHost, signal } from '../index'
import { Portal } from './portal'

afterEach(() => {
  clearHost()
})

describe('portal', () => {
  it('renders its children into the target instead of in place', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const overlays = memory.host.createElement('view')

    mount(memory.rootElement, () => (
      <Portal target={overlays}>
        <text>sheet</text>
      </Portal>
    ))

    expect(serializeMemoryTree(overlays as unknown as MemoryElement)).toContain('"sheet"')
    expect(serializeMemoryTree(memory.root)).not.toContain('"sheet"')
  })

  it('leaves a presentational placeholder where it was written', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const overlays = memory.host.createElement('view')

    mount(memory.rootElement, () => (
      <Portal target={overlays}>
        <text>sheet</text>
      </Portal>
    ))

    // Nobody wrote this element, so it must not appear to have been written —
    // the same rule every control-flow wrapper follows.
    expect((memory.root.children[0] as MemoryElement).props['role']).toBe('presentation')
  })

  it('takes the moved subtree with it when its place in the tree goes away', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const overlays = memory.host.createElement('view')
    const open = signal(true)

    mount(memory.rootElement, () => (
      <Show when={open}>
        {() => (
          <Portal target={overlays}>
            <text>sheet</text>
          </Portal>
        )}
      </Show>
    ))
    expect(serializeMemoryTree(overlays as unknown as MemoryElement)).toContain('"sheet"')

    open(false)

    // The whole reason a placeholder stays behind: it ties the moved subtree's
    // lifetime to the place that wrote it. Without that a dismissed sheet would
    // stay parked in the overlay root with its bindings still live.
    expect(serializeMemoryTree(overlays as unknown as MemoryElement)).not.toContain('"sheet"')
  })

  it('disposes with the mount that created it', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const overlays = memory.host.createElement('view')

    const dispose = mount(memory.rootElement, () => (
      <Portal target={overlays}>
        <text>sheet</text>
      </Portal>
    ))

    dispose()

    expect((overlays as unknown as MemoryElement).children).toHaveLength(0)
  })

  it('keeps the subtree reactive after the move', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const overlays = memory.host.createElement('view')
    const label = signal('one')

    mount(memory.rootElement, () => (
      <Portal target={overlays}>
        <text>{() => label()}</text>
      </Portal>
    ))

    label('two')

    // Moving a node between parents must not disturb what it is bound to —
    // exactly the kind of thing that looks fine and quietly stops updating.
    expect(serializeMemoryTree(overlays as unknown as MemoryElement)).toContain('"two"')
  })
})
