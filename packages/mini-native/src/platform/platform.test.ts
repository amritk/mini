import { afterEach, describe, expect, it } from 'vitest'

import type { Host } from '../host'
import { createMemoryHost } from '../hosts/create-memory-host'
import { clearHost, setHost } from '../index'
import { platform } from './platform'

afterEach(() => {
  clearHost()
})

/** A host that names itself whatever a case needs, over the reference implementation. */
const hostNamed = (name?: string): Host => {
  const { host } = createMemoryHost()
  // Destructured off rather than set to `undefined`, because the contract draws
  // a real distinction between a host that omitted the field and one that set
  // it to nothing — only the first is "this target did not say".
  const { platform: _named, ...unnamed } = host
  return name === undefined ? unnamed : { ...unnamed, platform: name }
}

describe('platform', () => {
  it('reports the name the installed host chose', () => {
    setHost(hostNamed('lynx'))

    expect(platform.os).toBe('lynx')
  })

  it('reports unknown when the host did not say', () => {
    setHost(hostNamed())

    expect(platform.os).toBe('unknown')
  })

  it('reads the host live rather than capturing it', () => {
    setHost(hostNamed('web'))
    expect(platform.os).toBe('web')

    // A swap is a real case — a test moving between hosts, a hot reload — and a
    // captured name would keep answering for the host that has gone.
    setHost(hostNamed('lynx'))
    expect(platform.os).toBe('lynx')
  })

  it('says so rather than guessing when nothing is installed', () => {
    expect(() => platform.os).toThrow(/setHost/)
  })

  it('picks the entry matching the target exactly', () => {
    setHost(hostNamed('lynx'))

    expect(platform.select({ lynx: 16, web: 12, default: 14 })).toBe(16)
  })

  it('falls back to native for a named target that is not the web', () => {
    setHost(hostNamed('lynx'))

    expect(platform.select({ web: 12, native: 16, default: 14 })).toBe(16)
  })

  it('does not treat the web as native', () => {
    setHost(hostNamed('web'))

    expect(platform.select({ native: 16, default: 14 })).toBe(14)
  })

  it('does not guess that an unnamed target is native', () => {
    setHost(hostNamed())

    // A host that has not said what it is has not said it is a device either.
    // Guessing here would be the wrong kind of helpful, so it takes the default.
    expect(platform.select({ native: 16, default: 14 })).toBe(14)
  })

  it('returns undefined when nothing matched and there is no default', () => {
    setHost(hostNamed('web'))

    expect(platform.select({ lynx: 16 })).toBeUndefined()
  })

  it('reads nothing off the object prototype', () => {
    setHost(hostNamed('toString'))

    // `in` would find `toString` on Object.prototype and hand back a function
    // as though the caller had asked for it.
    expect(platform.select({ default: 14 })).toBe(14)
  })
})
