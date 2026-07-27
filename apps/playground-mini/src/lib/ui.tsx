import type { MiniChildren } from '@amritk/mini'

/**
 * The playground's own chrome — the handful of presentational components every
 * page reuses. They are plain mini components, which is the point: there is no
 * component base class, no registration, and no lifecycle to opt into. A
 * component is a function that runs once and returns the element it built.
 */

export type SectionProps = {
  /** The heading — usually the API being demonstrated. */
  title: string
  /** One or two sentences on what the demo below is actually showing. */
  blurb?: string
  children?: MiniChildren
}

/** A titled card. Every demo on every page is wrapped in one. */
export const Section = (props: SectionProps): HTMLElement => (
  <section class="section">
    <header class="section-head">
      <h2>{props.title}</h2>
      {props.blurb === undefined ? null : <p>{props.blurb}</p>}
    </header>
    <div class="section-body">{props.children}</div>
  </section>
)

export type PageProps = {
  title: string
  /** The page's opening paragraph. */
  lede: string
  children?: MiniChildren
}

/**
 * A page shell: title, lede, then the sections.
 *
 * The children get their own wrapper rather than sitting next to the heading,
 * because `MiniChildren` may itself be an array and JSX's child list is not
 * nested — the runtime flattens, but the type deliberately does not, so a
 * forwarded `children` has to be the sole child of whatever holds it.
 */
export const Page = (props: PageProps): HTMLElement => (
  <div class="page">
    <h1>{props.title}</h1>
    <p class="lede">{props.lede}</p>
    <div>{props.children}</div>
  </div>
)

export type OutProps = {
  /**
   * The live value to display. A getter (or a signal passed uncalled) tracks
   * forever; pass one, never `value()`.
   */
  children: () => string
}

/** A monospaced readout of some live value. */
export const Out = (props: OutProps): HTMLElement => <div class="out">{props.children}</div>
