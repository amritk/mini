import { describe, expect, it } from 'vitest'

import { blur, focus } from './focus'
import { createMemoryHost } from './hosts/create-memory-host'
import { clearHost, setHost } from './index'
import type { HostElement } from './types'

describe('focus', () => {
  it('asks the host to move focus', () => {
    const memory = createMemoryHost()
    const focused: HostElement[] = []
    setHost({ ...memory.host, focus: (element) => focused.push(element) })
    const element = memory.host.createElement('input')

    focus(element)

    expect(focused).toEqual([element])
    clearHost()
  })

  it('asks the host to take focus away', () => {
    const memory = createMemoryHost()
    const blurred: HostElement[] = []
    setHost({ ...memory.host, blur: (element) => blurred.push(element) })
    const element = memory.host.createElement('input')

    blur(element)

    expect(blurred).toEqual([element])
    clearHost()
  })

  it('does nothing on a target with no notion of focus', () => {
    const memory = createMemoryHost()
    setHost(memory.host)
    const element = memory.host.createElement('input')

    // A no-op rather than an error, on purpose. A headless target should not
    // have to fake a focus concept, and an app should not have to branch on
    // whether it might be running against one.
    expect(() => focus(element)).not.toThrow()
    expect(() => blur(element)).not.toThrow()
    clearHost()
  })
})
