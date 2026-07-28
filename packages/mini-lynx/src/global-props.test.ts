import { afterEach, describe, expect, it } from 'vitest'

import { globalProps, setGlobalProps } from './global-props'
import { effect, effectScope } from './signals'

/**
 * The values the platform pushes in, as a signal. What is worth pinning is that
 * it behaves like every other signal here — a binding that reads it follows a
 * change — and that a replacement really replaces, since the engine sends the
 * complete bag every time and a merge would leave a removed key behind forever.
 */

afterEach(() => {
  setGlobalProps({})
})

describe('global-props', () => {
  it('starts as an empty bag rather than undefined', () => {
    // A read before the platform has said anything is the whole of the first
    // frame, and on some engine versions rather longer. It should not throw.
    expect(globalProps()).toEqual({})
    expect(globalProps<{ theme?: string }>().theme).toBeUndefined()
  })

  it('re-runs a binding when the platform pushes a change', () => {
    const seen: unknown[] = []
    const dispose = effectScope(() => {
      // A block body rather than an expression one: alien-signals reads an
      // effect's return value as its cleanup, and `push` returns a number.
      effect(() => {
        seen.push(globalProps<{ theme?: string }>().theme)
      })
    })

    setGlobalProps({ theme: 'dark' })

    // This is the point of it being a signal: a theme toggle reaches the tree
    // with nothing threaded through it.
    expect(seen).toEqual([undefined, 'dark'])
    dispose()
  })

  it('replaces the bag rather than merging into it', () => {
    setGlobalProps({ theme: 'dark', locale: 'en' })
    setGlobalProps({ theme: 'light' })

    // `updateGlobalProps` carries the complete set, so merging would make a
    // removed key linger for the life of the app.
    expect(globalProps()).toEqual({ theme: 'light' })
  })
})
