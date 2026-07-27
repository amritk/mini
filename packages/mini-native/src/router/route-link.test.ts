import { afterEach, describe, expect, it } from 'vitest'

import { clearEngine, setEngine } from '../engine/current-engine'
import { mount } from '../mount'
import { signal } from '../signals'
import { createFakeEngine, type FakeElement } from '../testing/create-fake-engine'
import { serializeTree } from '../testing/serialize-tree'
import type { NavigateOptions } from './create-router'
import { RouteLink } from './route-link'

afterEach(() => {
  clearEngine()
})

describe('route-link', () => {
  it('announces itself as a link rather than as prose', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () => RouteLink({ to: '/pricing', navigate: () => {}, children: 'Pricing' }))
    const link = engine.find('text') as FakeElement

    // Lynx has no addressable href to infer this from, so the trait is the only
    // thing telling a screen-reader user that tapping does something.
    expect(link.attrs['accessibility-traits']).toBe('link')
    expect(link.attrs['accessibility-element']).toBe(true)
  })

  it('renders its children as a text run', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () => RouteLink({ to: '/pricing', navigate: () => {}, children: 'Pricing' }))

    // A `<text>` rather than a `<view>` is what makes a bare string legal: a run
    // of text is a `raw-text` element and it may only live inside a `<text>`.
    expect(serializeTree(engine.page)).toContain('"Pricing"')
  })

  it('navigates through the router when tapped', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const went: string[] = []

    mount(engine.pageElement, () => RouteLink({ to: '/pricing', navigate: (to) => went.push(to) }))
    engine.dispatch(engine.find('text') as FakeElement, 'tap')

    expect(went).toEqual(['/pricing'])
  })

  it('follows a reactive destination', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const plan = signal('starter')
    const went: string[] = []

    mount(engine.pageElement, () => RouteLink({ to: () => `/plans/${plan()}`, navigate: (to) => went.push(to) }))
    plan('pro')
    engine.dispatch(engine.find('text') as FakeElement, 'tap')

    // The destination is read at tap time, so a link whose target depends on
    // state does not have to be rebuilt when that state moves.
    expect(went).toEqual(['/plans/pro'])
  })

  it('passes replace through', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const options: (NavigateOptions | undefined)[] = []

    mount(engine.pageElement, () =>
      RouteLink({ to: '/pricing', replace: true, navigate: (_to, option) => options.push(option) }),
    )
    engine.dispatch(engine.find('text') as FakeElement, 'tap')

    expect(options).toEqual([{ replace: true }])
  })

  it('defaults replace to false', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const options: (NavigateOptions | undefined)[] = []

    mount(engine.pageElement, () => RouteLink({ to: '/pricing', navigate: (_to, option) => options.push(option) }))
    engine.dispatch(engine.find('text') as FakeElement, 'tap')

    expect(options).toEqual([{ replace: false }])
  })

  it('takes an explicit accessible name when the visible label does not read as one', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)

    mount(engine.pageElement, () =>
      RouteLink({ to: '/pricing', navigate: () => {}, label: 'See pricing', children: 'here' }),
    )

    expect((engine.find('text') as FakeElement).attrs['accessibility-label']).toBe('See pricing')
  })

  it('detaches its tap listener when the mount goes away', () => {
    const engine = createFakeEngine()
    setEngine(engine.api)
    const went: string[] = []

    const dispose = mount(engine.pageElement, () => RouteLink({ to: '/pricing', navigate: (to) => went.push(to) }))
    const link = engine.find('text') as FakeElement

    dispose()
    engine.dispatch(link, 'tap')

    // Left attached, the engine keeps a dispatcher alive for a screen nobody
    // can see — and a stray tap would navigate an app that has moved on.
    expect(went).toEqual([])
  })
})
