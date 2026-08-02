import { afterEach, describe, expect, it } from 'vitest'

import { effect } from '../signals'
import { keyboardHeight, setKeyboardHeight } from './keyboard-height'

afterEach(() => {
  setKeyboardHeight(0)
})

describe('keyboard-height', () => {
  it('starts closed', () => {
    expect(keyboardHeight()).toBe(0)
  })

  it('re-runs a binding when the keyboard changes', () => {
    const seen: number[] = []
    const stop = effect(() => {
      seen.push(keyboardHeight())
    })

    setKeyboardHeight(336)
    setKeyboardHeight(0)
    stop()

    expect(seen).toEqual([0, 336, 0])
  })

  it('clamps anything that is not a positive height to closed', () => {
    // A `NaN` reaching a style binding becomes `padding-bottom: NaNpx`, which
    // the engine drops in silence — so the layout stops responding with nothing
    // anywhere to say why.
    setKeyboardHeight(Number.NaN)
    expect(keyboardHeight()).toBe(0)

    setKeyboardHeight(Number.POSITIVE_INFINITY)
    expect(keyboardHeight()).toBe(0)

    setKeyboardHeight(-1)
    expect(keyboardHeight()).toBe(0)
  })
})
