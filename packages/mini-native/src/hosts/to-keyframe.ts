import type { StyleValue } from '../types'
import { toStyleText } from './to-style-text'

/**
 * Turns one style bag into the property map a keyframe-based animation API
 * expects.
 *
 * Two conversions, both of them the host's job under the contract, and both of
 * them the sort of thing that is silently wrong rather than loudly broken when
 * skipped.
 *
 * Bare numbers become density-independent pixels, exactly as in `setStyle`: a
 * keyframe of `{ width: 100 }` has to mean the same hundred pixels it means in a
 * `style` prop, or the same bag would animate towards a value it could not be
 * set to. Skip this and the animation simply does not run, because a keyframe
 * property whose value will not parse is dropped without complaint.
 *
 * Keys are normalised to the IDL spelling, because a keyframe is a plain object
 * read by property name rather than a declaration parsed as CSS. `backgroundColor`
 * and `background-color` are the same property everywhere else in this package,
 * so they have to stay the same property here.
 *
 * Nothing platform-specific may creep into this file — the core type-check pass
 * runs without the DOM library, and this is shared by the hosts that check under
 * it.
 *
 * @example
 * ```ts
 * toKeyframe({ 'background-color': 'red', width: 100, height: null })
 * // { backgroundColor: 'red', width: '100px' }
 * ```
 */
export const toKeyframe = (frame: StyleValue): Record<string, string> => {
  const keyframe: Record<string, string> = {}
  for (const [key, value] of Object.entries(frame)) {
    // The three arms of `StyleValue` that mean "unset". A keyframe has nothing
    // to unset — it describes a position on a timeline — so they are dropped
    // rather than written as an empty string, which would animate the property
    // towards nothing.
    if (value === null || value === undefined || value === false) continue
    keyframe[idlName(key)] = toStyleText(key, value)
  }
  return keyframe
}

/**
 * Converts a kebab-case style key to its IDL spelling.
 *
 * camelCase keys pass through untouched, and so do custom properties: `--x` is
 * whatever its author named it, and case-folding somebody's variable would
 * rename it.
 */
const idlName = (key: string): string =>
  key.startsWith('--') ? key : key.replace(/-([a-z])/g, (_, letter: string) => (letter as string).toUpperCase())
