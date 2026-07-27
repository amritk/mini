// @vitest-environment happy-dom
import { clearEngine, type LynxElement, mount, setEngine } from '@amritk/mini-lynx'
import { afterEach, describe, expect, it } from 'vitest'

import { createDomPapi } from './lib/dom-papi'
import { ComposeScreen } from './screens/compose'
import { DataScreen } from './screens/data'
import { ElementsScreen } from './screens/elements'
import { EngineScreen } from './screens/engine'
import { EventsScreen } from './screens/events'
import { FlowScreen } from './screens/flow'
import { FormsScreen } from './screens/forms'
import { ListScreen } from './screens/list'
import { RoutingScreen } from './screens/routing'
import { StylingScreen } from './screens/styling'
import { TextScreen } from './screens/text'

/**
 * Every screen, mounted.
 *
 * A playground's failure mode is not a wrong assertion, it is a screen that
 * throws on the way up and is only noticed by whoever next opens that tab. This
 * is the cheapest possible guard against that: build each one through the same
 * preview engine the app runs on and check that something reached the tree.
 *
 * It is deliberately shallow. Asserting on what a screen SAYS would make every
 * copy edit a test failure, and the screens are documentation — they are meant
 * to be edited. What is worth pinning is that they build at all, and that the
 * tree they build is not empty.
 */

const SCREENS: readonly (readonly [name: string, screen: () => LynxElement])[] = [
  ['elements', ElementsScreen],
  ['text', TextScreen],
  ['list', ListScreen],
  ['styling', StylingScreen],
  ['events', EventsScreen],
  ['flow', FlowScreen],
  ['compose', ComposeScreen],
  ['forms', FormsScreen],
  ['data', DataScreen],
  ['engine', EngineScreen],
  ['routing', () => RoutingScreen({ params: () => ({ owner: 'amritk' }) })],
]

afterEach(() => {
  clearEngine()
  document.body.replaceChildren()
})

describe('screens', () => {
  for (const [name, screen] of SCREENS) {
    it(`builds ${name} without throwing`, () => {
      const root = document.createElement('div')
      document.body.append(root)

      const engine = createDomPapi({ root })
      setEngine(engine)
      const page = engine.__GetPageElement?.()
      expect(page).toBeDefined()

      const dispose = mount(page as LynxElement, screen)

      // A screen that built nothing is a screen whose panels all failed a
      // condition — which is the shape a broken screen takes here, since the
      // throw would already have failed the mount above.
      expect(root.querySelectorAll('view, text, image, scroll-view, list').length).toBeGreaterThan(5)

      // Disposal is part of the contract too: a screen that leaks effects makes
      // the NEXT screen's assertions flaky rather than its own.
      expect(() => dispose()).not.toThrow()
    })
  }
})
