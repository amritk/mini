import type { ColorScheme, Dimensions, HostEnvironment, Insets } from '../host'
import { type ReadonlySignal, signal } from '../signals'

/**
 * What a browser can say about itself: colour scheme, viewport, and the insets
 * a notched device eats out of a standalone page.
 *
 * Every field is set up LAZILY, on first read. A host is created at boot, often
 * before `document.body` exists, and an app that never asks about the colour
 * scheme should not have a `matchMedia` listener registered on its behalf.
 * Deferring also means the safe-area probe below runs when there is a body to
 * put it in.
 */
export const createDomEnvironment = (): HostEnvironment => ({
  colorScheme: onFirstRead(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const scheme = signal<ColorScheme>(query.matches ? 'dark' : 'light')
    query.addEventListener('change', (event) => scheme(event.matches ? 'dark' : 'light'))
    return scheme
  }),

  dimensions: onFirstRead(() => {
    const size = signal<Dimensions>(viewport())
    window.addEventListener('resize', () => size(viewport()))
    return size
  }),

  reduceMotion: onFirstRead(() => {
    // `reduce` is the only value that means anything; the media feature's other
    // state is `no-preference`, so matching the negative would be wrong the day
    // a third value is added.
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const reduce = signal(query.matches)
    query.addEventListener('change', (event) => reduce(event.matches))
    return reduce
  }),

  safeArea: onFirstRead(() => {
    const insets = signal<Insets>(readInsets())
    // Rotation reports as a resize, and so does a keyboard opening on most
    // mobile browsers — both change the insets, so one listener covers it.
    window.addEventListener('resize', () => insets(readInsets()))
    return insets
  }),
})

/**
 * Defers building a signal until something actually reads it, then keeps it.
 *
 * The listeners these register live as long as the document, which is right for
 * a per-context environment and wrong to pay for unasked.
 */
const onFirstRead = <T>(create: () => ReadonlySignal<T>): ReadonlySignal<T> => {
  let inner: ReadonlySignal<T> | null = null
  return () => {
    if (inner === null) inner = create()
    return inner()
  }
}

const viewport = (): Dimensions => ({ width: window.innerWidth, height: window.innerHeight })

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * Reads the safe-area insets the only way a browser exposes them.
 *
 * `env(safe-area-inset-*)` is available to CSS and to nothing else — there is
 * no JavaScript API for it — so the value has to be routed through a property
 * the browser will resolve and hand back. A throwaway element with those
 * functions as its padding is that route, and reading its computed padding
 * gives the four numbers.
 *
 * It is deliberately not a permanent probe. The values only change on a resize,
 * which is exactly when this runs again, and leaving an element parked in the
 * document is the kind of thing that turns up in somebody's `querySelectorAll`
 * a year later. On a browser with nothing eating into its edges — which is
 * every browser that is not a standalone page on a notched device — all four
 * resolve to zero, which is the honest answer rather than a fallback.
 */
const readInsets = (): Insets => {
  const body = document.body
  if (!body) return NO_INSETS

  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
  body.appendChild(probe)

  const computed = getComputedStyle(probe)
  const insets: Insets = {
    top: pixels(computed.paddingTop),
    right: pixels(computed.paddingRight),
    bottom: pixels(computed.paddingBottom),
    left: pixels(computed.paddingLeft),
  }

  probe.remove()
  return insets
}

/** A computed `padding` string as a number. Anything unparseable means no inset. */
const pixels = (value: string): number => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}
