import { afterEach, describe, expect, it } from 'vitest'

import { createMemoryHost } from '../hosts/create-memory-host'
import { clearHost, setHost, signal } from '../index'
import { reduceMotion } from './reduce-motion'

afterEach(() => {
  clearHost()
})

describe('reduce-motion', () => {
  it('reports no preference when the host cannot tell', () => {
    const { host } = createMemoryHost()
    setHost(host)

    // Defaulting the other way would turn every unteached host into one whose
    // animations silently never run, which reads as a broken framework rather
    // than as a setting being honoured.
    expect(reduceMotion()()).toBe(false)
  })

  it('reports what a host that can tell says', () => {
    const { host } = createMemoryHost()
    setHost({ ...host, environment: { reduceMotion: () => true } })

    expect(reduceMotion()()).toBe(true)
  })

  it('stays live, so changing the system setting reaches whatever read it', () => {
    const { host } = createMemoryHost()
    const reduce = signal(false)
    setHost({ ...host, environment: { reduceMotion: reduce } })

    const current = reduceMotion()
    reduce(true)

    // The setting is one a user changes while the app is open — often precisely
    // because the app just made them queasy — so a frozen read would be useless.
    expect(current()).toBe(true)
  })
})
