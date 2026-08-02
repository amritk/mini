import { callNative, callNativeAsync, onNativeEvent } from '@amritk/mini-lynx-native'

import { EVENTS, MODULE } from './native-module'
import type { LocationErrorCode, LocationFix, WatchOptions, WatchUpdate } from './types'

/** The position event's payload, as the native side publishes it. */
type PositionEvent = { readonly watchId: string; readonly position: LocationFix }

/** The error event's payload, as the native side publishes it. */
type ErrorEvent = { readonly watchId: string; readonly error: LocationErrorCode; readonly message: string }

/**
 * Starts a continuous location watch, and returns the function that stops it.
 *
 * Each fix arrives as `{ ok: true, position }`; a provider failure arrives as
 * `{ ok: false, error, message }` and does **not** end the subscription, because
 * a watch that lost its provider can get it back. Deciding when to give up is
 * the caller's, which is what the returned function is for.
 *
 * ## Stopping is not optional
 *
 * A running watch keeps a location provider alive, and on a phone that is a
 * battery cost the user can see in their settings app. This is the one API here
 * with a resource behind it — everything else is a one-shot call — so treat the
 * returned function the way you would a subscription, and hand it to `onCleanup`
 * so a navigation cannot leak one.
 *
 * ```tsx
 * import { onCleanup } from '@amritk/mini-lynx'
 *
 * const position = signal<LocationFix | null>(null)
 * onCleanup(watchPosition((update) => { if (update.ok) position(update.position) }, { distanceFilter: 10 }))
 * ```
 *
 * ## Why this is not a promise
 *
 * Because there is no last value to resolve with. The native side publishes
 * through `GlobalEventEmitter` for the reason `callNativeAsync` documents: a
 * bridge callback settles a promise once, so a native method that calls its
 * callback repeatedly has every invocation after the first silently dropped.
 *
 * ## The identifier race, and why you will not see it
 *
 * The watch's id is assigned natively and comes back over the bridge, so for a
 * few milliseconds this is subscribed to an event stream it cannot yet filter.
 * A fix published inside that window — which happens whenever the device
 * already has one to hand — is held and delivered once the id lands, rather
 * than dropped for not matching an id that had not arrived. Losing the first
 * fix of a watch is exactly the bug that would be blamed on the device.
 *
 * @example
 * ```ts
 * const stop = watchPosition((update) => {
 *   if (update.ok) trail.push(update.position)
 *   else if (update.error === 'permissionDenied') stop()
 * }, { accuracy: 'high', distanceFilter: 5 })
 * ```
 */
export const watchPosition = (listener: (update: WatchUpdate) => void, options: WatchOptions = {}): (() => void) => {
  /** Null until the native side answers with the id it filed this watch under. */
  let watchId: string | null = null
  let stopped = false
  /**
   * Events that arrived before the id did, each with the id it was published
   * for — a second watch running concurrently publishes onto the same event
   * name, so the filter still has to happen, just later.
   */
  const held: { readonly id: string; readonly update: WatchUpdate }[] = []

  const deliver = (id: string, update: WatchUpdate): void => {
    if (stopped) return
    if (watchId === null) {
      held.push({ id, update })
      return
    }
    if (id === watchId) listener(update)
  }

  const stopPosition = onNativeEvent(EVENTS.position, (payload) => {
    const event = payload as PositionEvent
    deliver(event.watchId, { ok: true, position: event.position })
  })

  const stopError = onNativeEvent(EVENTS.error, (payload) => {
    const event = payload as ErrorEvent
    deliver(event.watchId, { ok: false, error: event.error, message: event.message })
  })

  const release = (): void => {
    stopPosition()
    stopError()
  }

  // The rejection is swallowed rather than surfaced: the only reasons starting
  // fails are that the module is not linked or the host is running an older
  // native half, and neither is worth an unhandled rejection on a thread where
  // nothing is listening for one. A watch that never starts simply never
  // produces an update, which `isLocationAvailable` is the way to rule out.
  void callNativeAsync<string>(MODULE, 'startWatching', options)
    .then((id) => {
      // Stopped while the call was in flight. The native watch exists now and
      // nothing else holds its id, so this is the only chance to end it.
      if (stopped) {
        void callNative<void>(MODULE, 'stopWatching', id).catch(() => {})
        return
      }
      watchId = id
      for (const entry of held.splice(0)) {
        if (entry.id === id) listener(entry.update)
      }
    })
    .catch(() => {
      release()
    })

  return () => {
    if (stopped) return
    stopped = true
    held.length = 0
    release()
    if (watchId !== null) void callNative<void>(MODULE, 'stopWatching', watchId).catch(() => {})
  }
}
