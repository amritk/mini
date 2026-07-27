/** @jsxImportSource @amritk/mini-native */
// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'

import { createDomHost, domRoot } from '../hosts/create-dom-host'
import { clearHost, mount, setHost } from '../index'
import { Screen } from '../ui'
import { createMemoryHistory } from './create-memory-history'
import { createRouter, type Route } from './create-router'
import { RouteStack } from './route-stack'

/**
 * The stack against a real browser, because two of its decisions are only
 * checkable here.
 *
 * Its cards are absolutely positioned, which is the package's one layout
 * opinion and is inert on a headless host — the memory suite can assert the
 * style bag was written and nothing more. And a buried screen is hidden through
 * `Host.setVisible` rather than by being painted over, which is what keeps it
 * out of the tab order and out of the accessibility tree; `display: none` is
 * the thing that makes both true, and only a document has either.
 *
 * See `create-dom-host.test.tsx` for why this file carries both pragmas.
 */
afterEach(() => {
  clearHost()
})

const routes: Route[] = [
  {
    path: '/',
    view: () => (
      <Screen>
        <text>home</text>
      </Screen>
    ),
  },
  {
    path: '/settings',
    view: () => (
      <Screen>
        <text>settings</text>
      </Screen>
    ),
  },
]

/** Mounts a stack into a fresh element and hands back the root and the router. */
const stack = () => {
  setHost(createDomHost())
  const root = document.createElement('div')
  const router = createRouter({ routes, history: createMemoryHistory() })
  mount(domRoot(root), () => <RouteStack router={router} />)
  return { root, router }
}

/** The stack container — the stack's own element, and the only child of the root. */
const containerOf = (root: Element): HTMLElement => root.firstElementChild as HTMLElement

/** Whether an element has no `display: none` anywhere above it. */
const shown = (element: Element): boolean => {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if ((node as HTMLElement).style?.display === 'none') return false
  }
  return true
}

describe('route-stack on the DOM host', () => {
  it('makes the container the positioning context its cards resolve against', () => {
    const { root } = stack()

    // The load-bearing half of the layout opinion. Absolutely positioned cards
    // resolve against the nearest positioned ancestor, so without this they
    // would escape the stack entirely and land against whatever the app
    // happened to position further up.
    expect(containerOf(root).style.position).toBe('relative')
  })

  it('overlaps its cards rather than stacking them head to tail', () => {
    const { root, router } = stack()
    router.navigate('/settings')

    for (const card of containerOf(root).children) {
      const style = (card as HTMLElement).style
      expect(style.position).toBe('absolute')
      expect([style.top, style.right, style.bottom, style.left]).toEqual(['0px', '0px', '0px', '0px'])
    }
  })

  it('takes a buried screen out of the accessibility tree and the tab order', () => {
    const { root, router } = stack()
    router.navigate('/settings')

    const [beneath, top] = [...containerOf(root).children] as HTMLElement[]
    // `display: none` is what makes a buried screen genuinely gone rather than
    // merely covered: no focus, no screen reader, no tab stop. Painting over it
    // would leave every one of those reachable.
    expect(beneath?.style.display).toBe('none')
    expect(top?.style.display).not.toBe('none')

    // And it is why several screens can each be a `<main>` without the page
    // claiming to have more than one. Asserted by walking for a hidden ancestor
    // rather than by asking for a computed style: happy-dom lays nothing out,
    // which is the same limitation the reset's own suite carries.
    expect(root.querySelectorAll('main')).toHaveLength(2)
    expect([...root.querySelectorAll('main')].filter(shown)).toHaveLength(1)
  })

  it('shows the screen underneath again on the way back', () => {
    const { root, router } = stack()
    router.navigate('/settings')
    router.back()

    const cards = containerOf(root).children
    expect(cards).toHaveLength(1)
    expect((cards[0] as HTMLElement).style.display).not.toBe('none')
    expect(root.textContent).toContain('home')
  })
})
