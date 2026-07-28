import { describe, expect, it } from 'vitest'

import { currentFrame, withFrame } from '../context-frame'
import { signal } from '../signals'
import { createContext } from './create-context'

describe('create-context', () => {
  it('reads the fallback when nothing provided one', () => {
    const Theme = createContext('light')

    expect(Theme.use()).toBe('light')
  })

  it('reaches anything built inside the provider', () => {
    const Theme = createContext('light')

    const seen = Theme.provide('dark', () => Theme.use())

    expect(seen).toBe('dark')
  })

  it('puts back what was there once the provider returns', () => {
    const Theme = createContext('light')

    Theme.provide('dark', () => Theme.use())

    // Restored rather than left behind: a provider describes a region of the
    // tree, not a moment in time after which everything is dark.
    expect(Theme.use()).toBe('light')
  })

  it('lets an inner provider shadow an outer one', () => {
    const Theme = createContext('light')

    const seen = Theme.provide('dark', () => Theme.provide('high-contrast', () => Theme.use()))

    expect(seen).toBe('high-contrast')
  })

  it('keeps two contexts from colliding', () => {
    const Theme = createContext('light')
    const Locale = createContext('en')

    const seen = Theme.provide('dark', () => Locale.provide('fr', () => [Theme.use(), Locale.use()]))

    expect(seen).toEqual(['dark', 'fr'])
  })

  it('reaches a subtree built long after the provider returned', () => {
    const Theme = createContext('light')

    // This is the contract `renderChild` and `list` rely on, tested at the seam
    // rather than through them: they capture the frame during the component
    // body — inside whatever provider wraps it — and restore it around every
    // build afterwards. Without the frame surviving that round trip, a theme
    // provided at the app root would reach every component except the ones
    // inside a conditional or a list, and it would fail silently by falling
    // back to a plausible default.
    const frame = Theme.provide('dark', () => currentFrame())
    expect(Theme.use()).toBe('light')

    expect(withFrame(frame, () => Theme.use())).toBe('dark')
  })

  it('keeps a frame captured under one provider independent of a later one', () => {
    const Theme = createContext('light')

    const captured = Theme.provide('dark', () => currentFrame())
    Theme.provide('high-contrast', () => undefined)

    // A frame is a value rather than a pointer to "whatever is ambient now", so
    // a branch written under one provider cannot be rebuilt under another's.
    expect(withFrame(captured, () => Theme.use())).toBe('dark')
  })

  it('holds a signal so the value can change without a re-render', () => {
    const theme = signal('light')
    const Theme = createContext(theme)

    const seen = Theme.provide(theme, () => Theme.use())
    theme('dark')

    // The rule the whole design rests on: a component runs once and therefore
    // reads context once, so what has to stay live is the VALUE. A plain string
    // here would be frozen at build and there would be no second read.
    expect(seen()).toBe('dark')
  })
})
