// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'

import { clearHost, setHost } from '../index'
import { createDomHost } from './create-dom-host'
import { installDomReset, RESET_CONTAINER_MARKER, RESET_MARKER } from './dom-reset'

/**
 * The reset is the piece that decides whether write-once is true or a slogan,
 * so it is worth a suite of its own rather than being implied by the host's.
 *
 * What can be asserted here is what the reset SAYS — the rules are installed,
 * scoped, and stamped onto the right elements. What cannot be asserted is what
 * a real browser then does with them: happy-dom does not lay anything out, so
 * "an unstyled container stacks its children" is not a test that can exist
 * here. That gap is real and named in `docs/mini-native-style.md`; closing it
 * needs screenshots on two targets, which is a much larger commitment.
 */
afterEach(() => {
  clearHost()
  for (const style of document.querySelectorAll('style')) style.remove()
})

describe('dom-reset', () => {
  it('installs the stylesheet', () => {
    installDomReset()

    expect(document.querySelectorAll('style')).toHaveLength(1)
  })

  it('installs it only once per document', () => {
    installDomReset()
    installDomReset()
    createDomHost()

    // Idempotent by id rather than by a module flag, so a test that builds
    // several hosts and a hot reload that re-evaluates the module both land in
    // the same place.
    expect(document.querySelectorAll('style')).toHaveLength(1)
  })

  it('makes the browser lay out like Yoga', () => {
    installDomReset()
    const css = document.querySelector('style')?.textContent ?? ''

    // The divergences that make an unstyled container stack vertically on a
    // device and horizontally here.
    expect(css).toContain('display: flex')
    expect(css).toContain('flex-direction: column')
    expect(css).toContain('position: relative')
    expect(css).toContain('flex-shrink: 0')
    expect(css).toContain('min-width: 0')
  })

  it('never outranks the code above it', () => {
    installDomReset()
    const css = document.querySelector('style')?.textContent ?? ''

    // Every rule is wrapped in `:where()`, which is zero specificity — so a
    // single class or a `style` prop beats the reset without `!important` and
    // without anyone counting selectors. A reset that fights the app is a reset
    // people work around.
    for (const selector of css.matchAll(/^(\S.*?)\s*\{/gm)) {
      expect(selector[1]).toMatch(/^:where\(/)
    }
  })

  it('stamps every element it builds, so the reset reaches nothing else', () => {
    const host = createDomHost()
    const view = host.createElement('view') as unknown as HTMLElement

    // Scoped by attribute rather than applied globally: an app embedding this
    // runtime beside other markup keeps its own page.
    expect(view.hasAttribute(RESET_MARKER)).toBe(true)
  })

  it('marks everything but a text run as a container', () => {
    const host = createDomHost()
    const view = host.createElement('view') as unknown as HTMLElement
    const text = host.createElement('text') as unknown as HTMLElement

    // This is what implements "text inheritance stops at a container" — the
    // Yoga rule rather than the CSS one, so a colour set on a container does
    // not silently reach its text on one target and not the other.
    expect(view.hasAttribute(RESET_CONTAINER_MARKER)).toBe(true)
    expect(text.hasAttribute(RESET_CONTAINER_MARKER)).toBe(false)
  })

  it('leaves the flow wrapper alone', () => {
    const host = createDomHost()
    const wrapper = host.createFlowHost() as unknown as HTMLElement

    // `display: contents` means the wrapper has no box at all, so there is
    // nothing for a box reset to reset — and stamping it would put a
    // `display: flex` rule in the way of the one thing it must be.
    expect(wrapper.hasAttribute(RESET_MARKER)).toBe(false)
    expect(wrapper.style.display).toBe('contents')
  })

  it('can be declined by a guest in a page it does not own', () => {
    setHost(createDomHost({ reset: false }))
    const host = createDomHost({ reset: false })
    const view = host.createElement('view') as unknown as HTMLElement

    expect(view.hasAttribute(RESET_MARKER)).toBe(false)
  })
})
