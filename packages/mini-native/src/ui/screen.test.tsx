import { afterEach, describe, expect, it } from 'vitest'

import type { Insets } from '../host'
import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { clearHost, mount, type Signal, setHost, signal } from '../index'
import { Screen } from './screen'

afterEach(() => {
  clearHost()
})

/** A memory host that reports insets, standing in for a device with a notch. */
const hostWithInsets = (insets: Signal<Insets>): ReturnType<typeof createMemoryHost> => {
  const memory = createMemoryHost()
  return { ...memory, host: { ...memory.host, environment: { safeArea: insets } } }
}

describe('screen', () => {
  it('is the main content region', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Screen />)

    expect((memory.root.children[0] as MemoryElement).props['role']).toBe('main')
  })

  it('fills what it is given and stacks its content', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Screen />)

    // `flex: 1` is the piece that is not obvious: a view that merely wrapped its
    // content would leave the insets padding a short box in the middle of the
    // display rather than holding content off the edges.
    expect((memory.root.children[0] as MemoryElement).style).toMatchObject({
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
    })
  })

  it('keeps content out from under the hardware', () => {
    const insets = signal<Insets>({ top: 59, right: 0, bottom: 34, left: 0 })
    const memory = hostWithInsets(insets)
    setHost(memory.host)

    mount(memory.rootElement, () => <Screen />)

    expect((memory.root.children[0] as MemoryElement).style).toMatchObject({
      paddingTop: 59,
      paddingRight: 0,
      paddingBottom: 34,
      paddingLeft: 0,
    })
  })

  it('moves the padding when the device rotates', () => {
    const insets = signal<Insets>({ top: 59, right: 0, bottom: 34, left: 0 })
    const memory = hostWithInsets(insets)
    setHost(memory.host)

    mount(memory.rootElement, () => <Screen />)

    insets({ top: 0, right: 59, bottom: 21, left: 59 })

    // The whole reason the environment is signals rather than values. A
    // component runs exactly once, so there is no re-render for a plain value
    // to arrive on — the padding would simply be whatever it was at boot.
    expect((memory.root.children[0] as MemoryElement).style).toMatchObject({
      paddingTop: 0,
      paddingRight: 59,
      paddingBottom: 21,
      paddingLeft: 59,
    })
  })

  it('draws into the unsafe edges when asked', () => {
    const insets = signal<Insets>({ top: 59, right: 0, bottom: 34, left: 0 })
    const memory = hostWithInsets(insets)
    setHost(memory.host)

    mount(memory.rootElement, () => <Screen edgeToEdge={true} />)

    const style = (memory.root.children[0] as MemoryElement).style
    expect(style).toEqual({ display: 'flex', flexDirection: 'column', flex: 1 })
  })

  it('lets a caller style it without losing the insets', () => {
    const insets = signal<Insets>({ top: 59, right: 0, bottom: 34, left: 0 })
    const memory = hostWithInsets(insets)
    setHost(memory.host)

    mount(memory.rootElement, () => <Screen style={{ background: '#fff' }} />)

    expect((memory.root.children[0] as MemoryElement).style).toMatchObject({
      background: '#fff',
      paddingTop: 59,
    })
  })

  it('reports no padding on a host that has nothing to report', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => <Screen />)

    expect((memory.root.children[0] as MemoryElement).style).toMatchObject({ paddingTop: 0, paddingBottom: 0 })
  })
})
