import { describe, expect, it } from 'vitest'

import { darkTheme, defaultTheme, type Theme } from './theme'

/** The records that are colours, and therefore the ones the two themes are allowed to disagree about. */
const COLOUR_KEYS = ['tone', 'surface', 'border'] as const satisfies readonly (keyof Theme)[]

/**
 * The CSS system colours the default theme used to lean on.
 *
 * They are the reason this file exists: they resolve to the platform's light or
 * dark surface on the web and mean nothing at all to a native engine, so the
 * one target nobody runs day to day was the one they were wrong on.
 */
const SYSTEM_COLOURS = ['Canvas', 'CanvasText', 'LinkText', 'ButtonText', 'ButtonFace', 'Field', 'FieldText']

describe('theme', () => {
  it.each(COLOUR_KEYS)('gives light and dark the same %s keys', (key) => {
    // A token added to one theme and forgotten in the other is a screen that is
    // fine until somebody switches, which is the worst moment to find out.
    expect(Object.keys(darkTheme[key]).sort()).toEqual(Object.keys(defaultTheme[key]).sort())
  })

  it.each(COLOUR_KEYS)('gives light and dark different %s values', (key) => {
    // Structural sameness is only half of it: a record spread in from the light
    // theme and never overridden would pass the test above.
    expect(darkTheme[key]).not.toEqual(defaultTheme[key])
  })

  it('shares the non-colour scales between the two themes', () => {
    // A dark theme with its own type scale is not a colour scheme, it is a
    // second design. Sharing by reference is what makes that unrepresentable.
    expect(darkTheme.size).toBe(defaultTheme.size)
    expect(darkTheme.weight).toBe(defaultTheme.weight)
    expect(darkTheme.space).toBe(defaultTheme.space)
    expect(darkTheme.radius).toBe(defaultTheme.radius)
    expect(darkTheme.heading).toBe(defaultTheme.heading)
  })

  it.each([defaultTheme, darkTheme])('names no CSS system colour', (theme) => {
    const colours = COLOUR_KEYS.flatMap((key) => Object.values(theme[key]))

    // The regression guard for the reason this pair exists at all. A system
    // colour here type-checks, renders correctly on the web, and is an
    // unrecognised string on a device.
    for (const colour of colours) expect(SYSTEM_COLOURS).not.toContain(colour)
  })

  it('states a line height at every step of the type scale', () => {
    // An unstated one is resolved from the font's own metrics by a browser and
    // by something else entirely by a native engine, so the two targets
    // silently disagree about how tall a paragraph is.
    for (const step of Object.values(defaultTheme.size)) expect(step['lineHeight']).toBeTypeOf('number')
  })
})
