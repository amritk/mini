import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost } from '../hosts/create-memory-host'
import { clearHost, setHost, signal } from '../index'
import { safeArea } from './safe-area'

afterEach(() => {
  clearHost()
})

describe('safe-area', () => {
  it('reports no insets when the host cannot tell', () => {
    const { host } = createMemoryHost()
    setHost(host)

    expect(safeArea()()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('reports what a host that can tell says', () => {
    const { host } = createMemoryHost()
    const insets = signal({ top: 59, right: 0, bottom: 34, left: 0 })
    setHost({ ...host, environment: { safeArea: insets } })

    expect(safeArea()()).toEqual({ top: 59, right: 0, bottom: 34, left: 0 })
  })

  it('stays live, because rotating a device moves the insets', () => {
    const { host } = createMemoryHost()
    const insets = signal({ top: 59, right: 0, bottom: 34, left: 0 })
    setHost({ ...host, environment: { safeArea: insets } })

    const current = safeArea()
    insets({ top: 0, right: 59, bottom: 21, left: 59 })

    expect(current()).toEqual({ top: 0, right: 59, bottom: 21, left: 59 })
  })
})
