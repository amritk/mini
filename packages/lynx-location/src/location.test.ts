import { resetNativeChannel, setPeerContext } from '@amritk/mini-lynx-native'
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
import { createFakeContexts, createFakeEmitter } from '@amritk/mini-lynx-native/testing'
import { afterEach, describe, expect, it } from 'vitest'

import { getCurrentPosition } from './get-current-position'
import { getLastKnownPosition } from './get-last-known-position'
import { getPermissionStatus } from './get-permission-status'
import { isLocationAvailable } from './is-location-available'
import { isLocationEnabled } from './is-location-enabled'
import { MODULE } from './native-module'
import { requestPermission } from './request-permission'
import { reverseGeocode } from './reverse-geocode'
import { createFakeLocation, type FakeLocation } from './testing/create-fake-location'
import type { GeocodeAddress, LocationFix, WatchUpdate } from './types'
import { watchPosition } from './watch-position'

/**
 * These cases drive the real facade over the real bridge against the fake
 * native module, because the thing worth pinning is the contract between them:
 * the method names, their arities, and whether each is a returning or a
 * callback method. Get any of those wrong and the facade compiles, ships, and
 * fails on a device.
 *
 * They cannot tell you the Kotlin and the Objective-C agree with the fake.
 * Nothing here can — that is what `AGENTS.md` means by the device caveat.
 */

let uninstall: (() => void) | undefined

const setup = (): FakeLocation => {
  const contexts = createFakeContexts()
  const emitter = createFakeEmitter()
  const location = createFakeLocation(emitter)
  setPeerContext(contexts.mainThread)
  uninstall = installNativeBridge({
    peer: contexts.background,
    emitter,
    modules: { [MODULE]: location.module },
  })
  return location
}

/** A granted, location-enabled device — the starting point for most of these. */
const granted = (): FakeLocation => {
  const location = setup()
  location.setPermissionStatus('granted')
  return location
}

const fix = (overrides: Partial<LocationFix> = {}): LocationFix => ({
  latitude: 51.5072,
  longitude: -0.1276,
  accuracy: 12,
  altitude: null,
  altitudeAccuracy: null,
  speed: null,
  heading: null,
  timestamp: 1_700_000_000_000,
  ...overrides,
})

/** Lets the bridge's queued messages and the promises they settle drain. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  uninstall?.()
  uninstall = undefined
  resetNativeChannel()
  setPeerContext(null)
})

describe('location', () => {
  it('reports the module as available once it is linked', async () => {
    setup()
    await expect(isLocationAvailable()).resolves.toBe(true)
  })

  it('reports the module as unavailable when the host app did not link it', async () => {
    const contexts = createFakeContexts()
    setPeerContext(contexts.mainThread)
    uninstall = installNativeBridge({ peer: contexts.background, modules: {} })

    await expect(isLocationAvailable()).resolves.toBe(false)
  })

  it('reads the permission status without prompting', async () => {
    const location = setup()
    location.setPermissionStatus('restricted')

    await expect(getPermissionStatus()).resolves.toBe('restricted')
  })

  it('resolves with what the user decided when prompted', async () => {
    const location = setup()
    location.setPermissionOutcome('granted')

    await expect(requestPermission({ precise: true })).resolves.toBe('granted')
    await expect(getPermissionStatus()).resolves.toBe('granted')
  })

  it('reports the standing refusal rather than prompting again', async () => {
    const location = setup()
    location.setPermissionStatus('denied')
    location.setPermissionOutcome('granted')

    // Both platforms show nothing on a second ask. An app that reads this as
    // "not granted, try again next launch" prompts forever and never succeeds.
    await expect(requestPermission()).resolves.toBe('denied')
  })

  it('reads whether location services are switched on device-wide', async () => {
    const location = setup()
    location.setLocationEnabled(false)

    await expect(isLocationEnabled()).resolves.toBe(false)
  })

  it('resolves a fix', async () => {
    const location = granted()
    location.setNextFix(fix({ latitude: 40.7128, longitude: -74.006 }))

    const result = await getCurrentPosition({ accuracy: 'high' })

    expect(result.ok).toBe(true)
    expect(result.ok && result.position.latitude).toBe(40.7128)
  })

  it('fails with permissionDenied rather than prompting', async () => {
    const location = setup()
    location.setNextFix(fix())

    const result = await getCurrentPosition()

    expect(result).toEqual({ ok: false, error: 'permissionDenied', message: 'location permission is undetermined' })
    // Reading a position must never spend the one-shot system prompt.
    await expect(getPermissionStatus()).resolves.toBe('undetermined')
  })

  it('distinguishes location being switched off from permission being refused', async () => {
    const location = granted()
    location.setNextFix(fix())
    location.setLocationEnabled(false)

    const result = await getCurrentPosition()

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toBe('locationDisabled')
  })

  it('times out rather than waiting forever when the device has no fix to give', async () => {
    const location = granted()
    location.setNextFix(null)

    const result = await getCurrentPosition({ timeout: 200 })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toBe('timeout')
  })

  it('answers from the cache when maximumAge allows it', async () => {
    const location = granted()
    location.setLastKnownPosition(fix({ latitude: 1, timestamp: Date.now() }))
    // Never reached: a cached fix inside the age is the whole point of asking.
    location.setNextFix(fix({ latitude: 2 }))

    const result = await getCurrentPosition({ maximumAge: 60_000 })

    expect(result.ok && result.position.latitude).toBe(1)
  })

  it('ignores a cached fix that is older than maximumAge', async () => {
    const location = granted()
    location.setLastKnownPosition(fix({ latitude: 1, timestamp: Date.now() - 120_000 }))
    location.setNextFix(fix({ latitude: 2 }))

    const result = await getCurrentPosition({ maximumAge: 60_000 })

    expect(result.ok && result.position.latitude).toBe(2)
  })

  it('reads the last known position without starting a provider', async () => {
    const location = granted()
    location.setLastKnownPosition(fix({ latitude: 48.8566 }))

    await expect(getLastKnownPosition()).resolves.toMatchObject({ latitude: 48.8566 })
  })

  it('has no last known position to give without permission', async () => {
    const location = setup()
    location.setLastKnownPosition(fix())

    await expect(getLastKnownPosition()).resolves.toBeNull()
  })

  it('delivers fixes to a watch', async () => {
    const location = granted()
    const updates: WatchUpdate[] = []

    const stop = watchPosition((update) => updates.push(update), { distanceFilter: 10 })
    await settle()

    location.emitPosition(fix({ latitude: 3 }))
    location.emitPosition(fix({ latitude: 4 }))

    expect(updates).toEqual([
      { ok: true, position: fix({ latitude: 3 }) },
      { ok: true, position: fix({ latitude: 4 }) },
    ])
    stop()
  })

  it('passes the watch options through to the native side', async () => {
    const location = granted()

    const stop = watchPosition(() => {}, { accuracy: 'high', distanceFilter: 25, interval: 5000 })
    await settle()

    expect(location.watches()).toEqual([
      { id: 'fake-watch-1', options: { accuracy: 'high', distanceFilter: 25, interval: 5000 } },
    ])
    stop()
  })

  it('delivers a watch failure without ending the subscription', async () => {
    const location = granted()
    const updates: WatchUpdate[] = []

    const stop = watchPosition((update) => updates.push(update))
    await settle()

    location.emitError('locationDisabled', 'location services are off')
    location.emitPosition(fix({ latitude: 5 }))

    // A watch that lost its provider can get it back, so the failure is an
    // update and not a termination — deciding to give up is the caller's.
    expect(updates).toEqual([
      { ok: false, error: 'locationDisabled', message: 'location services are off' },
      { ok: true, position: fix({ latitude: 5 }) },
    ])
    stop()
  })

  it('stops the native watch when the subscription is released', async () => {
    const location = granted()
    const updates: WatchUpdate[] = []

    const stop = watchPosition((update) => updates.push(update))
    await settle()
    expect(location.watches()).toHaveLength(1)

    stop()
    await settle()

    // A running watch holds a location provider open, which is a battery cost
    // the user can see. Leaking one is the failure mode this pins.
    expect(location.watches()).toEqual([])
    expect(updates).toEqual([])
  })

  it('delivers a fix that arrived before the watch id did', async () => {
    const location = granted()
    const updates: WatchUpdate[] = []

    // No `await settle()`: the watch is subscribed to the event stream but has
    // not yet been told which id is its own. A device that already has a fix
    // publishes inside this window, and dropping it would lose the first fix of
    // every watch — the bug that gets blamed on the hardware.
    const stop = watchPosition((update) => updates.push(update))
    location.emitPosition(fix({ latitude: 6 }))

    expect(updates).toEqual([])
    await settle()

    expect(updates).toEqual([{ ok: true, position: fix({ latitude: 6 }) }])
    stop()
  })

  it('keeps one watch from receiving events held for another', async () => {
    const location = granted()
    const first: WatchUpdate[] = []
    const second: WatchUpdate[] = []

    const stopFirst = watchPosition((update) => first.push(update))
    await settle()

    const stopSecond = watchPosition((update) => second.push(update))
    // Published while the second watch is still waiting for its id, but
    // addressed to the first. Holding events cannot mean forgetting who they
    // were for.
    location.emitPosition(fix({ latitude: 7 }), 'fake-watch-1')
    await settle()

    expect(first).toEqual([{ ok: true, position: fix({ latitude: 7 }) }])
    expect(second).toEqual([])
    stopFirst()
    stopSecond()
  })

  it('stops a watch that was released before its id arrived', async () => {
    const location = granted()

    const stop = watchPosition(() => {})
    // Released inside the same window: the native watch exists by now and
    // nothing else holds its id, so this is the only chance to end it.
    stop()
    await settle()

    expect(location.watches()).toEqual([])
  })

  it('delivers nothing after the subscription is released', async () => {
    const location = granted()
    const updates: WatchUpdate[] = []

    const stop = watchPosition((update) => updates.push(update))
    await settle()

    const [watch] = location.watches()
    stop()
    location.emitPosition(fix({ latitude: 8 }), watch?.id)

    expect(updates).toEqual([])
  })
})

describe('reverseGeocode', () => {
  const address = (overrides: Partial<GeocodeAddress> = {}): GeocodeAddress => ({
    formattedAddress: '1000 Rue Saint-Denis, Montreal, QC H2X 3J2, Canada',
    name: null,
    streetNumber: '1000',
    street: 'Rue Saint-Denis',
    district: null,
    city: 'Montreal',
    subregion: null,
    region: 'Quebec',
    postalCode: 'H2X 3J2',
    country: 'Canada',
    isoCountryCode: 'CA',
    ...overrides,
  })

  /** Montreal, and somewhere in the North Atlantic. */
  const MONTREAL = { latitude: 45.5017, longitude: -73.5673 }

  it('returns the addresses the geocoder found', async () => {
    const location = setup()
    location.setNextAddresses([address()])

    const result = await reverseGeocode(MONTREAL)

    expect(result).toEqual({ ok: true, addresses: [address()] })
  })

  it('does not need location permission', async () => {
    // The behaviour most likely to be broken by someone "tidying up" the native
    // halves to look like every other method here. Reverse geocoding never
    // reads the device's own location, so gating it would make an app request a
    // permission it has no use for.
    const location = setup()
    location.setPermissionStatus('denied')
    location.setNextAddresses([address()])

    const result = await reverseGeocode(MONTREAL)

    expect(result.ok).toBe(true)
  })

  it('reports notFound where there is no address', async () => {
    const location = setup()
    location.setNextAddresses([])

    const result = await reverseGeocode({ latitude: 45.5, longitude: -40 })

    expect(result).toEqual({ ok: false, error: 'notFound', message: expect.any(String) })
  })

  it('reports invalidCoordinates rather than asking the geocoder', async () => {
    const location = setup()
    location.setNextAddresses([address()])

    const result = await reverseGeocode({ latitude: 91, longitude: 0 })

    expect(result).toEqual({ ok: false, error: 'invalidCoordinates', message: expect.any(String) })
  })

  it('reports network when the service cannot be reached', async () => {
    const location = setup()
    location.setNextAddresses([address()])
    location.setNetworkAvailable(false)

    const result = await reverseGeocode(MONTREAL)

    expect(result).toEqual({ ok: false, error: 'network', message: expect.any(String) })
  })

  it('reports unavailable on a device with no geocoder', async () => {
    const location = setup()
    location.setNextAddresses([address()])
    location.setGeocoderPresent(false)

    const result = await reverseGeocode(MONTREAL)

    expect(result).toEqual({ ok: false, error: 'unavailable', message: expect.any(String) })
  })

  it('sends the coordinates and the options across as one bag', async () => {
    const location = setup()
    location.setNextAddresses([address()])

    await reverseGeocode(MONTREAL, { locale: 'fr-CA', maxResults: 3 })

    expect(location.geocodes()).toEqual([{ ...MONTREAL, locale: 'fr-CA', maxResults: 3 }])
  })

  it('asks for one address when no maxResults is given', async () => {
    const location = setup()
    location.setNextAddresses([address({ city: 'Montreal' }), address({ city: 'Laval' })])

    const result = await reverseGeocode(MONTREAL)

    expect(result.ok && result.addresses).toHaveLength(1)
  })

  it('accepts a LocationFix as coordinates', async () => {
    // `LocationFix` structurally satisfies `Coordinates`, which is the whole
    // reason the two are separate types — pairing the calls should not need a
    // mapping step.
    const location = setup()
    location.setNextAddresses([address()])

    const result = await reverseGeocode(fix({ latitude: 45.5017, longitude: -73.5673 }))

    expect(result.ok).toBe(true)
    expect(location.geocodes()).toEqual([{ ...MONTREAL, locale: undefined, maxResults: undefined }])
  })
})
