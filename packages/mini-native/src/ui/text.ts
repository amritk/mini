import { jsx } from '../jsx-runtime'
import type { HostElement, MiniChildren } from '../types'
import type { Forwarded } from './forwarded'

/** Props for {@link Text}. */
export type TextProps = Forwarded<'text'> & {
  /** The text run. A function child is a reactive text binding, as everywhere else. */
  children?: MiniChildren
}

/**
 * A run of text, and nothing more.
 *
 * It builds a plain `text` element and adds no semantics, which makes it look
 * like a component that earns nothing. It earns two things.
 *
 * The first is that it is not a `Heading`. `role` and `level` are gone from its
 * surface, so a `Text` cannot become a heading by accident — which is the whole
 * point of the split described on {@link Heading}: the moment size and outline
 * depth travel on one prop, authors pick heading levels by how big they want
 * the text, and the document outline stops meaning anything to a screen reader
 * or a crawler. Keeping them separate is cheap here and unrecoverable later.
 *
 * The second is that it is the seam. A screen written in `<Text>` rather than
 * `<text>` can be given a type scale, a colour tone, and a theme without any
 * screen being touched — see the note on the module.
 */
export const Text = (props: TextProps): HostElement => jsx('text', props)
