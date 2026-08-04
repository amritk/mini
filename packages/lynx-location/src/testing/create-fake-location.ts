import type { FakeEmitter } from '@amritk/mini-lynx-native/testing'

import { EVENTS } from '../native-module'
import type {
  GeocodeAddress,
  GeocodeErrorCode,
  GeocodeResult,
  LocationErrorCode,
  LocationFix,
  LocationPermissionStatus,
  LocationResult,
  PositionOptions,
  WatchOptions,
} from '../types'

/**
 * The bag `reverseGeocode` flattens its two arguments into on the way across.
 *
 * Declared here rather than in `types.ts` because it is the wire shape rather
 * than part of the package's surface: the facade builds it, both native halves
 * read it, and nothing a consumer writes should ever name it. The coordinates
 * are `unknown` because this is the boundary that has to cope with a caller who
 * ignored the types.
 */
type ReverseGeocodeRequest = {
  readonly latitude?: unknown
  readonly longitude?: unknown
  readonly locale?: string
  readonly maxResults?: number
}

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
  /**
   * The addresses the geocoder would return, best first. An empty list is what
   * `reverseGeocode` reports as `notFound`. Empty by default, because a fake
   * that invented an address for every coordinate would let a caller skip the
   * one branch that fires over open water.
   */
  setNextAddresses(addresses: readonly GeocodeAddress[]): void
  /**
   * Whether this device has a geocoding backend at all. Present by default.
   *
   * Set it false to model an Android device built without Google's services,
   * where `Geocoder.isPresent` is false for the life of the device.
   */
  setGeocoderPresent(present: boolean): void
  /** Whether the geocoding service can be reached. Reachable by default. */
  setNetworkAvailable(available: boolean): void
  /** Every reverse geocode the fake has been asked for, in order. */
  geocodes(): readonly FakeGeocode[]
}

/** A reverse geocode the fake was asked for, as it arrived over the wire. */
export type FakeGeocode = {
  readonly latitude: unknown
  readonly longitude: unknown
  readonly locale: string | undefined
  readonly maxResults: number | undefined
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
 * Reverse geocoding is modelled the same way round: the failure paths are real
 * — no geocoder on the device, coordinates out of range, no network, no address
 * there — and the addresses themselves are whatever `setNextAddresses` was
 * handed. `locale` is recorded rather than honoured, because inventing
 * translations here would be the fake asserting against itself again.
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
  let addresses: readonly GeocodeAddress[] = []
  let geocoderPresent = true
  let networkAvailable = true

  const watches: FakeWatch[] = []
  const geocodes: FakeGeocode[] = []

  /**
   * The range check both native halves run before asking their geocoder.
   *
   * It lives on this side too because it is part of the contract rather than an
   * implementation detail: Android's `Geocoder` throws on out-of-range input and
   * CoreLocation quietly answers with nothing, so neither platform can be left
   * to report this for itself.
   */
  const validCoordinates = (latitude: unknown, longitude: unknown): boolean =>
    typeof latitude === 'number' &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === 'number' &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180

  /** The id an `emit*` helper targets when a test does not name one. */
  const currentWatch = (): string | undefined => watches[watches.length - 1]?.id

  const failure = (error: LocationErrorCode, message: string): LocationResult => ({ ok: false, error, message })

  const geocodeFailure = (error: GeocodeErrorCode, message: string): GeocodeResult => ({ ok: false, error, message })

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

    reverseGeocode: (request: ReverseGeocodeRequest, done: (value: GeocodeResult) => void) => {
      const { latitude, longitude, locale, maxResults } = request
      geocodes.push({ latitude, longitude, locale, maxResults })

      // Deliberately no permission check, on either platform or here. Reverse
      // geocoding never reads the device's own location, so it is available to
      // an app that has been refused location outright — and a fake that gated
      // it would push consumers into requesting a permission they do not need.
      if (!geocoderPresent) {
        done(geocodeFailure('unavailable', 'no geocoder on this device'))
        return
      }
      // Checked before the network, because it is the one failure that is the
      // caller's own doing and no amount of retrying fixes it.
      if (!validCoordinates(latitude, longitude)) {
        done(geocodeFailure('invalidCoordinates', `${String(latitude)}, ${String(longitude)} is not a coordinate`))
        return
      }
      if (!networkAvailable) {
        done(geocodeFailure('network', 'could not reach the geocoding service'))
        return
      }
      // Nothing there is `notFound` rather than an empty success: open water
      // genuinely has no address, and `GeocodeResult` has exactly one spelling
      // for that so a call site cannot handle half of it.
      if (addresses.length === 0) {
        done(geocodeFailure('notFound', 'no address at these coordinates'))
        return
      }

      done({ ok: true, addresses: addresses.slice(0, Math.max(1, maxResults ?? 1)) })
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
    setNextAddresses: (next) => {
      addresses = next
    },
    setGeocoderPresent: (present) => {
      geocoderPresent = present
    },
    setNetworkAvailable: (available) => {
      networkAvailable = available
    },
    geocodes: () => [...geocodes],
  }
}
