// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'

import { createDomEnvironment } from './dom-environment'

/**
 * The DOM half of the host environment.
 *
 * This is the one host that reads its answers off a platform rather than being
 * handed them, so it is the one where the wiring can silently be wrong. It
 * carries the happy-dom pragma for the same reason `create-dom-host.test.tsx`
 * does; the memory and Lynx suites still run in plain node, and they are what
 * prove the runtime carries no platform dependency.
 */
afterEach(() => {
  restoreViewport()
})

describe('dom-environment', () => {
  it('reports the colour scheme the browser is already in', () => {
    installMatchMedia(true)

    expect(createDomEnvironment().colorScheme?.()).toBe('dark')
  })

  it('follows the colour scheme when it changes', () => {
    const change = installMatchMedia(false)
    const scheme = createDomEnvironment().colorScheme
    // Reading first is what registers the listener: the fields are built on
    // first read, so an app that never asks pays for no subscription.
    expect(scheme?.()).toBe('light')

    change(true)

    expect(scheme?.()).toBe('dark')
  })

  it('reports the viewport size', () => {
    setViewport(390, 844)

    expect(createDomEnvironment().dimensions?.()).toEqual({ width: 390, height: 844 })
  })

  it('follows a resize', () => {
    setViewport(390, 844)
    const size = createDomEnvironment().dimensions
    expect(size?.()).toEqual({ width: 390, height: 844 })

    setViewport(844, 390)
    window.dispatchEvent(new Event('resize'))

    expect(size?.()).toEqual({ width: 844, height: 390 })
  })

  it('builds each field once and keeps it', () => {
    setViewport(390, 844)
    const size = createDomEnvironment().dimensions
    expect(size?.()).toEqual({ width: 390, height: 844 })

    setViewport(500, 500)

    // Rebuilding on every read would re-register a listener each time and, worse,
    // would hand back a fresh signal that nothing already tracking is subscribed
    // to — so this has to still be the value from the last resize, not the
    // window's current size.
    expect(size?.()).toEqual({ width: 390, height: 844 })
  })

  it('reports no insets on a browser with nothing eating into its edges', () => {
    // Which is every browser that is not a standalone page on a notched device.
    // Zero here is the honest answer rather than a fallback.
    expect(createDomEnvironment().safeArea?.()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })

  it('leaves nothing behind after reading the insets', () => {
    const before = document.body.children.length

    createDomEnvironment().safeArea?.()

    // The insets can only be read through a real element, because `env()` is
    // available to CSS and to nothing else. Parking that element in the document
    // is how it turns up in somebody's `querySelectorAll` a year later, so it
    // goes as soon as it has been measured.
    expect(document.body.children.length).toBe(before)
  })
})

/**
 * Points `matchMedia` at a fixed answer and hands back a way to change it.
 *
 * happy-dom has no colour-scheme preference to set, and a real browser only
 * changes this from the OS, so the query itself is the thing to stand in for.
 */
const installMatchMedia = (dark: boolean): ((next: boolean) => void) => {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()

  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('dark') && dark,
      media: query,
      addEventListener: (_name: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener)
      },
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia

  return (next) => {
    for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent)
  }
}

/** Overrides the window's reported size, since a test cannot resize a real one. */
const setViewport = (width: number, height: number): void => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
}

/** Hands the size properties back to the environment, so cases stay independent. */
const restoreViewport = (): void => {
  Reflect.deleteProperty(window, 'innerWidth')
  Reflect.deleteProperty(window, 'innerHeight')
}
