import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost, type MemoryElement } from '../hosts/create-memory-host'
import { dispatchMemoryEvent } from '../hosts/dispatch-memory-event'
import { clearHost, mount, setHost, signal } from '../index'
import { RouteLink } from './route-link'

afterEach(() => {
  clearHost()
})

/** A stand-in for a web activation, with only the fields `RouteLink` reads. */
type FakeActivation = {
  preventDefault: () => void
  prevented: boolean
  metaKey?: boolean
  button?: number
}

const activation = (extra: Partial<FakeActivation> = {}): FakeActivation => {
  const event: FakeActivation = {
    prevented: false,
    preventDefault: () => {
      event.prevented = true
    },
    ...extra,
  }
  return event
}

describe('route-link', () => {
  it('is a real link, so the web keeps its own affordances', () => {
    const memory = createMemoryHost()
    setHost(memory.host)

    mount(memory.rootElement, () => (
      <RouteLink to="/pricing" navigate={() => {}}>
        Pricing
      </RouteLink>
    ))

    // An href and a link role: on the web that is an actual <a>, so
    // middle-click, open-in-new-tab, copy-link and a crawler all work without
    // the router doing anything.
    const link = memory.root.children[0] as MemoryElement
    expect(link.props['role']).toBe('link')
    expect(link.props['href']).toBe('/pricing')
  })

  it('navigates through the router instead of leaving the app', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const went: string[] = []

    mount(memory.rootElement, () => <RouteLink to="/pricing" navigate={(to) => went.push(to)} />)
    const event = activation()
    dispatchMemoryEvent(memory.root.children[0] as MemoryElement, 'tap', event)

    expect(went).toEqual(['/pricing'])
    expect(event.prevented).toBe(true)
  })

  it('leaves a modified activation to the browser', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const went: string[] = []

    mount(memory.rootElement, () => <RouteLink to="/pricing" navigate={(to) => went.push(to)} />)
    const event = activation({ metaKey: true })
    dispatchMemoryEvent(memory.root.children[0] as MemoryElement, 'tap', event)

    // Cmd-click means "open this in a new tab", and a router link that eats it
    // is a bug users report as "your site is broken".
    expect(went).toEqual([])
    expect(event.prevented).toBe(false)
  })

  it('leaves a non-primary button alone', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const went: string[] = []

    mount(memory.rootElement, () => <RouteLink to="/pricing" navigate={(to) => went.push(to)} />)
    dispatchMemoryEvent(memory.root.children[0] as MemoryElement, 'tap', activation({ button: 1 }))

    expect(went).toEqual([])
  })

  it('navigates on a target with no default to prevent', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const went: string[] = []

    mount(memory.rootElement, () => <RouteLink to="/pricing" navigate={(to) => went.push(to)} />)
    // A device tap: nothing to intercept, because the tap is the whole gesture.
    dispatchMemoryEvent(memory.root.children[0] as MemoryElement, 'tap', {})

    expect(went).toEqual(['/pricing'])
  })

  it('follows a reactive destination', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const plan = signal('starter')
    const went: string[] = []

    mount(memory.rootElement, () => <RouteLink to={() => `/plans/${plan()}`} navigate={(to) => went.push(to)} />)
    plan('pro')
    dispatchMemoryEvent(memory.root.children[0] as MemoryElement, 'tap', {})

    expect((memory.root.children[0] as MemoryElement).props['href']).toBe('/plans/pro')
    expect(went).toEqual(['/plans/pro'])
  })

  it('passes replace through', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const options: unknown[] = []

    mount(memory.rootElement, () => (
      <RouteLink to="/pricing" replace={true} navigate={(_to, option) => options.push(option)} />
    ))
    dispatchMemoryEvent(memory.root.children[0] as MemoryElement, 'tap', {})

    expect(options).toEqual([{ replace: true }])
  })
})
