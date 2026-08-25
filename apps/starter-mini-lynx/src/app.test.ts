import { createFakeEngine, serializeTree } from '@amritk/mini-lynx/testing'
import { setPeerContext } from '@amritk/mini-lynx-native'
import { createFakeContexts } from '@amritk/mini-lynx-native/testing'
import { beforeEach, expect, it } from 'vitest'

/**
 * The app, driven the way the engine drives it: put a PAPI on the global
 * object, call the global the entry registered, look at the tree.
 *
 * This is here as much to show the shape as to check the screen. An app on this
 * runtime needs no device, no emulator and no browser to be tested —
 * `createFakeEngine` is a complete Element PAPI, so a test against it is a test
 * against the same API the phone exposes, and `main-thread.tsx` is imported
 * exactly as the bundle's main-thread chunk is executed.
 *
 * The engine is installed as **globals** rather than with `setEngine`, because
 * that is where `renderPage` looks: the PAPI is injected into the main-thread
 * context as bare globals on a device, and an entry point that took its engine
 * from somewhere else would be an entry point no engine could call. Passing a
 * fake explicitly — `renderPage(App, { engine })` — is the other way, and it is
 * the one to reach for when the app under test is not the shipping entry.
 */

type LynxGlobals = { renderPage?: () => void }

let engine = createFakeEngine()

beforeEach(() => {
  engine = createFakeEngine()
  Object.assign(globalThis, engine.api)

  // The bridge's main-thread half talks to a peer context that exists only in a
  // bundle with two chunks in it. The package publishes a fake pair for exactly
  // this: the call goes out, nothing answers, and the screen shows its pending
  // state instead of throwing.
  setPeerContext(createFakeContexts().mainThread)
})

it('renders the first screen when the engine calls renderPage', async () => {
  // The import runs `renderPage(App)`, which registers the global. The engine
  // is what calls it, so the test does too.
  await import('./main-thread')
  ;(globalThis as LynxGlobals).renderPage?.()

  const tree = serializeTree(engine.page)
  expect(tree).toContain('mini-lynx')
  expect(tree).toContain('rspeedy → QR → Lynx Explorer')
})

it('counts taps by mutating the text element rather than rebuilding it', async () => {
  await import('./main-thread')
  ;(globalThis as LynxGlobals).renderPage?.()

  const card = engine.findAll('view').find((element) => element.classes.includes('card'))
  expect(card).toBeDefined()
  const value = engine.findAll('text').find((element) => element.classes.includes('card-value'))

  engine.dispatch(card as never, 'tap')
  engine.dispatch(card as never, 'tap')

  expect(serializeTree(engine.page)).toContain('text="2"')
  // The same element, written twice. Nothing was rebuilt to get here, which is
  // the runtime's whole claim and the one an app should be able to check.
  expect(engine.findAll('text').find((element) => element.classes.includes('card-value'))).toBe(value)
})
