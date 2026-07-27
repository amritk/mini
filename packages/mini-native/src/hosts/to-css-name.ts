/**
 * Converts a camelCase style key to its CSS spelling, leaving custom properties
 * alone.
 *
 * A style bag accepts both spellings — `fontSize` and `font-size` are the same
 * property everywhere in this package, and the `/ui` layer, `defaultTheme` and
 * every example are written in the camelCase one. A target that is handed a
 * DECLARATION rather than a property-name lookup therefore has to translate,
 * because CSS has never had a `fontSize` property and an unrecognised
 * declaration is dropped in silence rather than reported.
 *
 * Both real hosts need exactly this, which is why it is here rather than inside
 * one of them: the DOM host calls `style.setProperty`, and the Lynx host hands
 * `__SetInlineStyles` a map the engine parses as CSS. It is the mirror image of
 * `to-keyframe.ts`, which converts the other way for the same underlying
 * reason — a keyframe is a plain object read by property name, so there the IDL
 * spelling is the correct one.
 *
 * Nothing platform-specific may creep in here: the core type-check pass runs
 * without the DOM library and this is shared by the hosts that check under it.
 *
 * @example
 * ```ts
 * toCssName('backgroundColor')  // 'background-color'
 * toCssName('font-size')        // 'font-size'
 * toCssName('--brand')          // '--brand'
 * ```
 */
export const toCssName = (key: string): string =>
  key.startsWith('--') ? key : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
