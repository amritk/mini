import { requireEngine, scheduleFlush } from '../engine/current-engine'
import type { GestureDetectorConfig, LynxElement } from '../engine/element-api'
import { registerWorklet, releaseWorklet, type WorkletHandle } from '../events/worklet-registry'
import { onCleanup } from '../on-cleanup'
import type { Dispose } from '../types'

/**
 * Gesture composition — the half of the engine's gesture system that ordinary
 * events cannot express.
 *
 * Recognising a gesture is already possible without this: `bindtap` fires,
 * `catchtap` intercepts, and the touch stream (`bindtouchstart` and friends) is
 * enough to work out a pan or a flick by hand. What none of that can say is how
 * one recogniser RELATES to another — and that is the whole problem the moment a
 * tappable card sits inside a horizontal pager sits inside a vertical scroller,
 * because all three want the same finger and only the engine can arbitrate.
 *
 * Three relations, and they are the reason this module exists:
 *
 * - **`waitFor`** — do not recognise until the named recognisers have failed.
 *   A single tap waiting for a double tap.
 * - **`simultaneous`** — both may recognise from the same finger. A pinch and a
 *   rotation on the same image.
 * - **`continueWith`** — hand the stream on when this one finishes. A pan that
 *   becomes a fling.
 *
 * The names of the callbacks are **not defined here**, deliberately. Which
 * callbacks a recogniser reads is a property of the recogniser's type in the
 * engine, so this module passes whatever it is given straight through — the same
 * arrangement attributes and events have, and for the same reason: the engine's
 * documentation stays this runtime's documentation, and a callback the engine
 * gains works with no release here.
 */

/**
 * The engine's recogniser types.
 *
 * These are the engine's own numbering rather than names invented here; the
 * values are string-compared against nothing and index-compared against
 * everything, so they cannot be tidied.
 */
export const GestureType = {
  PAN: 0,
  FLING: 1,
  DEFAULT: 2,
  TAP: 3,
  LONG_PRESS: 4,
  ROTATION: 5,
  PINCH: 6,
  NATIVE: 7,
} as const

export type GestureTypeValue = (typeof GestureType)[keyof typeof GestureType]

/** How this recogniser relates to others, by their ids. */
export type GestureRelations = {
  /** Recognise only once every one of these has failed. */
  readonly waitFor?: readonly number[]
  /** Allow these to recognise from the same touch at the same time. */
  readonly simultaneous?: readonly number[]
  /** Hand the touch stream to these when this one finishes. */
  readonly continueWith?: readonly number[]
}

export type GestureDetector = GestureRelations & {
  /**
   * This recogniser's id, unique among the recognisers on this element.
   *
   * An id rather than a reference because the relations are declared BY id, and
   * a recogniser routinely has to name one that has not been created yet — two
   * gestures that wait for each other cannot both be constructed first.
   * `nextGestureId()` hands out ids that will not collide.
   */
  readonly id: number
  readonly type: GestureTypeValue | number
  /**
   * The recogniser's callbacks, by the name the ENGINE gives them.
   *
   * Each becomes a worklet handle, because a gesture callback is dispatched
   * through exactly the same path an event listener is — and a raw closure is
   * silently never invoked there, on a device only. See `events/worklet-registry.ts`.
   */
  readonly callbacks?: Readonly<Record<string, (event: unknown) => void>>
  /** Tuning the recogniser type itself takes — a minimum distance, a duration. */
  readonly config?: Readonly<Record<string, unknown>>
}

let nextId = 1

/**
 * An id no other recogniser from this function will use.
 *
 * Ids only have to be unique per element, but handing out globally unique ones
 * costs nothing and removes the failure where two components each number their
 * gestures from one and are then composed onto the same element.
 */
export const nextGestureId = (): number => nextId++

/**
 * Installs a gesture recogniser on `element`, and returns a dispose that removes it.
 *
 * Disposal is registered against the enclosing scope as well, so a recogniser
 * belonging to a component goes away when the component does without the caller
 * having to hold the handle.
 *
 * @example
 * ```tsx
 * const pan = nextGestureId()
 * const tap = nextGestureId()
 *
 * <view
 *   ref={(el) => {
 *     setGestureDetector(el, { id: pan, type: GestureType.PAN, callbacks: { onUpdate: track } })
 *     // The tap must lose to a pan that has started, or a drag also taps.
 *     setGestureDetector(el, { id: tap, type: GestureType.TAP, waitFor: [pan], callbacks: { onEnd: open } })
 *   }}
 * />
 * ```
 */
export const setGestureDetector = (element: LynxElement, detector: GestureDetector): Dispose => {
  const engine = requireEngine()
  if (!engine.__SetGestureDetector) {
    throw new Error('This engine has no __SetGestureDetector, so gesture composition is unavailable.')
  }

  const handles: WorkletHandle[] = []
  const callbacks: { name: string; callback: WorkletHandle }[] = []
  for (const [name, callback] of Object.entries(detector.callbacks ?? {})) {
    const handle = registerWorklet((event) => callback(event))
    handles.push(handle)
    callbacks.push({ name, callback: handle })
  }

  const config: GestureDetectorConfig =
    detector.config === undefined ? { callbacks } : { callbacks, config: detector.config }

  // The engine gates its gesture arbiter on this attribute, and will not consult
  // a detector without it. The name is a fossil of the framework that got there
  // first — the engine string-compares it, so it is `has-react-gesture` here too
  // or the recogniser is installed and never consulted.
  engine.__SetAttribute(element, 'has-react-gesture', true)
  // A flattened element is folded into its parent's layer and has no touch
  // target of its own, which would leave the recogniser attached to something
  // the engine never hit-tests.
  engine.__SetAttribute(element, 'flatten', false)

  engine.__SetGestureDetector(element, detector.id, detector.type, config, {
    waitFor: detector.waitFor ?? [],
    simultaneous: detector.simultaneous ?? [],
    continueWith: detector.continueWith ?? [],
  })
  scheduleFlush()

  let removed = false
  const dispose = (): void => {
    if (removed) return
    removed = true
    requireEngine().__RemoveGestureDetector?.(element, detector.id)
    for (const handle of handles) releaseWorklet(handle)
    scheduleFlush()
  }

  onCleanup(dispose)
  return dispose
}
