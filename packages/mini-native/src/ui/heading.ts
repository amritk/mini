import { jsx } from '../jsx-runtime'
import type { HostElement, MiniChildren } from '../types'
import type { Forwarded } from './forwarded'

/** Props for {@link Heading}. */
export type HeadingProps = Forwarded<'text'> & {
  /**
   * Depth in the document outline, 1–6, defaulting to 2 so a screen's single
   * top-level heading stays a deliberate act.
   *
   * This is the SEMANTIC prop and it is the only one here — it says where this
   * sits in the outline, never how big it renders. The two are genuinely
   * independent: a sidebar section header is an `h2` that renders small, and a
   * hero stat is large text that is not a heading at all. Couple them and
   * authors start choosing a level by the size they wanted, which is exactly
   * how an outline stops being navigable.
   */
  level?: 1 | 2 | 3 | 4 | 5 | 6
  children?: MiniChildren
}

/**
 * A heading, at a stated depth in the outline.
 *
 * The DOM host builds a real `<h1>`…`<h6>` from `level`, so find-in-page, the
 * browser's own outline, and a crawler all see it; a native host reports a
 * heading of that depth to the platform's accessibility layer. Neither is
 * something a component author should have to remember, which is the argument
 * for this layer existing at all.
 */
export const Heading = (props: HeadingProps): HostElement => jsx('text', { ...props, role: 'heading' })
