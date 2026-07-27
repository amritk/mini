import { describe, expect, it } from 'vitest'

import { toKeyframe } from './to-keyframe'

describe('to-keyframe', () => {
  it('adds the unit a bare number implies', () => {
    // The same rule `setStyle` follows. Without it the property is dropped by
    // the animation API rather than rejected, so the animation just does not
    // run — the quietest possible failure.
    expect(toKeyframe({ width: 100, translateY: 40 })).toEqual({ width: '100px', translateY: '40px' })
  })

  it('leaves the properties whose numbers are ratios alone', () => {
    expect(toKeyframe({ opacity: 0.5, scale: 2 })).toEqual({ opacity: '0.5', scale: '2' })
  })

  it('normalises kebab-case keys to their IDL spelling', () => {
    // A keyframe is read by property name rather than parsed as CSS, so the two
    // spellings this package accepts everywhere else have to converge here.
    expect(toKeyframe({ 'background-color': 'red' })).toEqual({ backgroundColor: 'red' })
  })

  it('leaves camelCase keys and custom properties untouched', () => {
    expect(toKeyframe({ backgroundColor: 'red', '--shadow-x': 4 })).toEqual({
      backgroundColor: 'red',
      '--shadow-x': '4',
    })
  })

  it('drops the values that mean "unset"', () => {
    // A keyframe describes a position on a timeline and so has nothing to unset.
    // Writing these through as empty strings would animate towards nothing.
    expect(toKeyframe({ opacity: 1, width: null, height: undefined, color: false })).toEqual({ opacity: '1' })
  })
})
