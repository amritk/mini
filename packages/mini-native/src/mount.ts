import { requireEngine, scheduleFlush } from './engine/current-engine'
import type { LynxElement } from './engine/element-api'
import { effectScope } from './signals'
import { insert, remove } from './tree'
import type { Dispose } from './types'

/**
 * Mounts a component into a container and returns a dispose that tears down
 * everything it set up — the application root.
 *
 * A component runs once and returns an element, and the reactivity it creates
 * along the way (bindings, effects, `onCleanup` registrations) belongs to
 * whatever `effectScope` was active while it ran. At the top level there is not
 * one, so a root component attached by hand would leave its effects with no
 * owner: nothing could dispose them, and a top-level `onCleanup` would never
 * fire. `mount` is that owner. It runs the component inside a fresh scope,
 * attaches the element, and hands back a dispose that detaches it and tears the
 * scope down.
 *
 * Call it once at the entry point, and call the returned dispose when the whole
 * tree should go away — a test finishing, a card being torn down, a reload.
 *
 * The tree is committed synchronously at the end rather than being left to the
 * scheduled flush, because this is the first screen: everything else in the
 * package can afford to wait for the end of the tick, and the first paint
 * cannot.
 *
 * @example
 * ```tsx
 * import { globalEngine, mount, pageElement, setEngine } from '@amritk/mini-native'
 *
 * setEngine(globalEngine())
 * const dispose = mount(pageElement(), App)
 * ```
 */
export const mount = (container: LynxElement, component: () => LynxElement): Dispose => {
  const engine = requireEngine()
  // effectScope runs its body synchronously, so the assignment is definite —
  // just invisible to the compiler, hence the non-null claim.
  let node!: LynxElement
  const dispose = effectScope(() => {
    node = component()
  })
  insert(container, node, null)
  engine.__FlushElementTree()

  return () => {
    dispose()
    remove(node)
    scheduleFlush()
  }
}

/**
 * The page element the engine already owns — the usual mount target.
 *
 * An app does not create its root; the engine hands it one, and this is how the
 * runtime asks for it. Kept beside `mount` rather than on the engine type
 * because it is a convenience for the entry point, not part of the surface the
 * rest of the runtime drives.
 */
export const pageElement = (): LynxElement => {
  const page = requireEngine().__GetPageElement?.()
  if (!page) {
    throw new Error('This engine has no page element. Pass a container to mount(...) explicitly.')
  }
  return page
}
