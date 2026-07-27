/**
 * `@amritk/mini-lynx/testing` — a complete in-memory Lynx engine.
 *
 * The package's own suite runs against this, and so can an app's. That is a
 * stronger claim than a test double usually gets to make: the code under test
 * is the code that ships. There is no second renderer to keep in step and no
 * preview target that can quietly disagree with the device, because the engine's
 * API is small enough to implement honestly — which is exactly why the runtime
 * takes it as an argument instead of reading the globals.
 *
 * What it cannot tell you is anything about layout or paint. It records what it
 * was asked to do; it does not do it. An assertion that an element was given
 * `flex-direction: row` is sound, and one about how wide it ended up is not
 * something any test outside a device should be making.
 *
 * @example
 * ```ts
 * import { mount, setEngine } from '@amritk/mini-lynx'
 * import { createFakeEngine, serializeTree } from '@amritk/mini-lynx/testing'
 *
 * const engine = createFakeEngine()
 * setEngine(engine.api)
 * mount(engine.pageElement, Counter)
 *
 * engine.dispatch(engine.find('view')!, 'tap')
 * expect(serializeTree(engine.page)).toMatchInlineSnapshot()
 * ```
 */

export { createFakeEngine, type FakeElement, type FakeEngine } from './create-fake-engine'
export { serializeTree } from './serialize-tree'
