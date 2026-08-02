import type { FakeEmitter } from '@amritk/mini-lynx-native/testing'

import { EVENTS } from '../native-module'
import type {
  LocationErrorCode,
  LocationFix,
  LocationPermissionStatus,
  LocationResult,
  PositionOptions,
  WatchOptions,
} from '../types'

/** A watch the fake module currently has running. */
export type FakeWatch = {
  readonly id: string
  readonly options: WatchOptions
}

/** The fake module, plus the handles a test needs to play the platform's part. */
export type FakeLocation = {
  /** Register this under `MODULE` in the registry handed to `installNativeBridge`. */
  readonly module: Readonly<Record<string, unknown>>
  /** Sets what the next permission read reports, as the system would. */
  setPermissionStatus(status: LocationPermissionStatus): void
  /** What a `requestPermission` prompt will resolve to. Defaults to `granted`. */
  setPermissionOutcome(status: LocationPermissionStatus): void
  /** Switches device-wide location services on or off. On by default. */
  setLocationEnabled(enabled: boolean): void
  /**
   * The fix a provider would produce. Set it to `null` to model a device that
   * never gets one, which is what `getCurrentPosition` reports as a timeout.
   */
  setNextFix(fix: LocationFix | null): void
  /** Seeds the cached fix `getLastKnownPosition` and `maximumAge` read. */
  setLastKnownPosition(fix: LocationFix | null): void
  /** Publishes a fix to a watch. Defaults to the most recently started one. */
  emitPosition(position: LocationFix, watchId?: string): void
  /** Publishes a failure to a watch. Defaults to the most recently started one. */
  emitError(error: LocationErrorCode, message: string, watchId?: string): void
  /** The watches currently running, in the order they were started. */
  watches(): readonly FakeWatch[]
}

/**
 * An in-memory stand-in for the native location module.
 *
 * The point of this is not to test the facade's plumbing — that is four lines
 * per function and the bridge's own suite already covers the wire. It is that
 * **the two native implementations cannot be run here at all**, so the contract
 * between JavaScript and native is otherwise pinned by nothing. This fake is
 * that contract, executable: it implements the same method names, arities and
 * call forms the Kotlin and the Objective-C do, and the suite drives the real
 * facade against it. A facade that calls `startWatching` with the wrong arity,
 * or reads a field the native side does not send, fails here.
 *
 * What it emphatically does **not** verify is that the Kotlin and the
 * Objective-C match it. Nothing in this repository can — see `AGENTS.md`.
 *
 * ## It reproduces the platforms rather than smoothing them over
 *
 * A permission request after a refusal returns the refusal; a fix requested
 * with location switched off fails as `locationDisabled` even when permission
 * is granted; a device with no fix to give times out instead of resolving. Each
 * of those is a real platform rule, and a fake that was friendlier than a
 * device would hide exactly the bugs worth catching.
 *
 * What it does not model is provider behaviour — `distanceFilter`, `interval`
 * and `accuracy` are recorded on the watch for a test to assert on, and no fix
 * is ever filtered by them. Those belong to CoreLocation and to Android's
 * `LocationManager`, and a fake that invented its own version would be
 * asserting against itself.
 *
 * @example
 * ```ts
 * const emitter = createFakeEmitter()
 * const location = createFakeLocation(emitter)
 * installNativeBridge({ peer, emitter, modules: { [MODULE]: location.module } })
 * ```
 */
export const createFakeLocation = (emitter: FakeEmitter): FakeLocation => {
  let status: LocationPermissionStatus = 'undetermined'
  let outcome: LocationPermissionStatus = 'granted'
  let enabled = true
  let nextFix: LocationFix | null = null
  let lastKnown: LocationFix | null = null
  let nextWatch = 1

  const watches: FakeWatch[] = []

  /** The id an `emit*` helper targets when a test does not name one. */
  const currentWatch = (): string | undefined => watches[watches.length - 1]?.id

  const failure = (error: LocationErrorCode, message: string): LocationResult => ({ ok: false, error, message })

  const module = {
    getPermissionStatus: (done: (value: LocationPermissionStatus) => void) => done(status),

    requestPermission: (_request: unknown, done: (value: LocationPermissionStatus) => void) => {
      // The platform's rule, reproduced rather than smoothed over: a request
      // made after a refusal shows nothing and reports the refusal back. A fake
      // that granted on the second ask would hide the bug this causes.
      status = status === 'undetermined' ? outcome : status
      done(status)
    },

    isLocationEnabled: (done: (value: boolean) => void) => done(enabled),

    getCurrentPosition: (options: PositionOptions, done: (value: LocationResult) => void) => {
      if (status !== 'granted') {
        done(failure('permissionDenied', `location permission is ${status}`))
        return
      }
      // Checked after permission and before anything else, because a granted
      // app on a device with location switched off is the case an app is most
      // likely to report to its user as a permission problem.
      if (!enabled) {
        done(failure('locationDisabled', 'location services are off'))
        return
      }

      const maximumAge = options.maximumAge ?? 0
      if (maximumAge > 0 && lastKnown !== null && Date.now() - lastKnown.timestamp <= maximumAge) {
        done({ ok: true, position: lastKnown })
        return
      }

      // No fix to give is a wait that ends at the timeout, not an error the
      // provider reports. Modelling it as anything else would let a caller skip
      // the one branch that actually happens indoors.
      if (nextFix === null) {
        done(failure('timeout', `no fix within ${options.timeout ?? 15000}ms`))
        return
      }

      lastKnown = nextFix
      done({ ok: true, position: nextFix })
    },

    getLastKnownPosition: (done: (value: LocationFix | null) => void) => done(status === 'granted' ? lastKnown : null),

    startWatching: (options: WatchOptions, done: (value: string) => void) => {
      const id = `fake-watch-${nextWatch++}`
      watches.push({ id, options })
      done(id)
    },

    stopWatching: (id: string) => {
      const index = watches.findIndex((watch) => watch.id === id)
      if (index >= 0) watches.splice(index, 1)
    },
  } satisfies Record<string, unknown>

  /** Publishing to a watch that is not running is a no-op, as it is natively. */
  const publish = (event: string, watchId: string | undefined, payload: Record<string, unknown>): void => {
    const id = watchId ?? currentWatch()
    if (id === undefined || !watches.some((watch) => watch.id === id)) return
    emitter.emit(event, { watchId: id, ...payload })
  }

  return {
    module,
    setPermissionStatus: (next) => {
      status = next
    },
    setPermissionOutcome: (next) => {
      outcome = next
    },
    setLocationEnabled: (next) => {
      enabled = next
    },
    setNextFix: (fix) => {
      nextFix = fix
    },
    setLastKnownPosition: (fix) => {
      lastKnown = fix
    },
    emitPosition: (position, watchId) => publish(EVENTS.position, watchId, { position }),
    emitError: (error, message, watchId) => publish(EVENTS.error, watchId, { error, message }),
    watches: () => [...watches],
  }
}
