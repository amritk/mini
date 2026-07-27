import { jsx } from '../jsx-runtime'
import { safeArea } from '../platform/safe-area'
import type { ContainerChildren, HostElement, StyleValue } from '../types'
import type { Forwarded } from './forwarded'
import { mergeStyle } from './merge-style'

/** Props for {@link Screen}. */
export type ScreenProps = Forwarded<'view'> & {
  /** The screen's content. Like any container, it cannot hold a bare text run. */
  children?: ContainerChildren
  /**
   * Draw into the unsafe edges anyway.
   *
   * The honest escape hatch for the one case that genuinely wants it: a hero
   * image or a map that should run under the status bar, with its own controls
   * inset instead. Everything else wants the insets.
   */
  edgeToEdge?: boolean
}

/**
 * A whole screen: the main content region, kept out from under the hardware.
 *
 * This is the component that earns the host environment its keep. Applying the
 * safe-area insets is the thing every native screen needs and every web page
 * ignores, and it should happen in ONE place rather than in every app — a
 * notch, a rounded corner, a status bar, and a home indicator all eat into a
 * device's screen, and content drawn underneath them is not merely ugly, it is
 * invisible. On the web the insets are zero except in a standalone page on a
 * notched device, where they are suddenly not, and the same component covers
 * both without the app knowing which it is on.
 *
 * The padding is a getter, so a rotation moves it. That falls out of the
 * environment being signals rather than values, which in turn falls out of a
 * component running exactly once — there is no re-render for a plain value to
 * ride in on, so the value would simply be whatever it was at boot.
 *
 * One caveat worth knowing. `role="main"` means the DOM host builds a real
 * `<main>`, and a page may only meaningfully have one — which is right for a
 * native nav stack, where one screen is presented at a time, and wrong if you
 * render several at once for a transition. `RouteStack` is fine: it hides every
 * screen but the top one through `Host.setVisible`, which takes them out of the
 * accessibility tree, so only one `<main>` is ever exposed. Rendering several
 * yourself is the case to watch — use a plain {@link Stack} for the ones that
 * are not the current screen.
 */
export const Screen = (props: ScreenProps): HostElement => {
  const { style, edgeToEdge, ...rest } = props
  const insets = safeArea()

  const base = (): StyleValue =>
    edgeToEdge === true
      ? FILL
      : {
          ...FILL,
          paddingTop: insets().top,
          paddingRight: insets().right,
          paddingBottom: insets().bottom,
          paddingLeft: insets().left,
        }

  return jsx('view', { ...rest, role: 'main', style: mergeStyle(base, style) })
}

/**
 * A screen fills what it is given and stacks its content.
 *
 * `flex: 1` is the piece that is not obvious: a native screen is expected to
 * take the whole of its container, and a view that merely wraps its content
 * would leave the safe-area padding sitting around a short box in the middle of
 * the display instead of holding the content off the edges.
 */
const FILL: StyleValue = { display: 'flex', flexDirection: 'column', flex: 1 }
