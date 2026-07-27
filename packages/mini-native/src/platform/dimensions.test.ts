import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost } from '../hosts/create-memory-host'
import { clearHost, setHost, signal } from '../index'
import { dimensions } from './dimensions'

afterEach(() => {
  clearHost()
})

describe('dimensions', () => {
  it('reports zeroes when the host cannot measure', () => {
    const { host } = createMemoryHost()
    setHost(host)

    // Zeroes rather than a plausible phone size, deliberately: a guessed
    // 375×667 would read as a real measurement and be wrong in a way nobody
    // would notice until it was on a tablet.
    expect(dimensions()()).toEqual({ width: 0, height: 0 })
  })

  it('reports what a host that can measure says, and keeps reporting it', () => {
    const { host } = createMemoryHost()
    const size = signal({ width: 390, height: 844 })
    setHost({ ...host, environment: { dimensions: size } })

    const current = dimensions()
    expect(current()).toEqual({ width: 390, height: 844 })

    size({ width: 844, height: 390 })
    expect(current()).toEqual({ width: 844, height: 390 })
  })
})
