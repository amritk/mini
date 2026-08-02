import { afterEach, describe, expect, it } from 'vitest'

import { signal } from '../signals'
import { setKeyboardHeight } from './keyboard-height'
import { keyboardLift } from './keyboard-lift'

afterEach(() => {
  setKeyboardHeight(0)
})

describe('keyboard-lift', () => {
  it('is the keyboard height when nothing is accounted for', () => {
    const lift = keyboardLift()

    setKeyboardHeight(336)

    expect(lift()).toBe(336)
  })

  it('subtracts the inset an ancestor already pads for', () => {
    // The keyboard covers the home-indicator region too, so a bar already
    // sitting above it rises by the difference. Adding both is the single most
    // common way to get this wrong.
    const lift = keyboardLift({ inset: 34 })

    setKeyboardHeight(336)

    expect(lift()).toBe(302)
  })

  it('never goes negative when the inset is larger than the keyboard', () => {
    const lift = keyboardLift({ inset: 400 })

    setKeyboardHeight(336)

    expect(lift()).toBe(0)
  })

  it('adds the offset on top of the lift', () => {
    const lift = keyboardLift({ inset: 34, offset: 8 })

    setKeyboardHeight(336)

    expect(lift()).toBe(310)
  })

  it('is zero while the keyboard is closed, offset included', () => {
    // A gap above a keyboard that is not there is just a hole in the layout.
    const lift = keyboardLift({ offset: 8 })

    expect(lift()).toBe(0)
  })

  it('tracks a reactive inset', () => {
    // The bottom inset genuinely changes — rotating a notched phone moves it.
    const inset = signal(34)
    const lift = keyboardLift({ inset })

    setKeyboardHeight(336)
    expect(lift()).toBe(302)

    inset(0)
    expect(lift()).toBe(336)
  })
})
