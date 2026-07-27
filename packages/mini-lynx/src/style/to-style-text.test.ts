import { describe, expect, it } from 'vitest'

import { toStyleText } from './to-style-text'

describe('to-style-text', () => {
  it('adds the unit to a bare number, because a bare number means dp', () => {
    expect(toStyleText('width', 100)).toBe('100px')
    expect(toStyleText('marginTop', 0)).toBe('0px')
    expect(toStyleText('border-radius', 8)).toBe('8px')
  })

  it('leaves ratios, counts and multipliers alone', () => {
    expect(toStyleText('opacity', 0.5)).toBe('0.5')
    expect(toStyleText('zIndex', 10)).toBe('10')
    expect(toStyleText('z-index', 10)).toBe('10')
    expect(toStyleText('flexGrow', 1)).toBe('1')
    expect(toStyleText('fontWeight', 600)).toBe('600')
    expect(toStyleText('aspectRatio', 1.5)).toBe('1.5')
  })

  it('treats line-height as a length, not as the web multiplier', () => {
    // CSS reads a bare number here as a multiple of the font size, so the
    // shipped theme's `{ fontSize: 18, lineHeight: 28 }` would render a 504px
    // line on the web and a 28dp line on a device — one style bag meaning two
    // different things, which is precisely what the dp rule exists to prevent.
    expect(toStyleText('lineHeight', 28)).toBe('28px')
    expect(toStyleText('line-height', 16)).toBe('16px')
    // The ratio stays expressible; it just has to say so.
    expect(toStyleText('lineHeight', '1.5')).toBe('1.5')
  })

  it('passes a string through untouched', () => {
    expect(toStyleText('width', '50%')).toBe('50%')
    expect(toStyleText('transform', 'translateX(4px)')).toBe('translateX(4px)')
  })

  it('does not guess a unit for a custom property', () => {
    expect(toStyleText('--gutter', 12)).toBe('12')
  })
})
