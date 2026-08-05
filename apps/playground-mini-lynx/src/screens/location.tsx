import {
  getCurrentPosition,
  getLastKnownPosition,
  getPermissionStatus,
  isLocationAvailable,
  isLocationEnabled,
  type LocationFix,
  type LocationPermissionStatus,
  requestPermission,
  reverseGeocode,
  watchPosition,
} from '@amritk/lynx-location'
import { type LynxElement, onCleanup, signal } from '@amritk/mini-lynx'
import { Show } from '@amritk/mini-lynx/flow'

import { Action, Chip, Panel, Prose, Readout, Row, Stack, TextLine } from '../components'
import { fakeDevice } from '../lib/fake-device'

/**
 * `/location` — `@amritk/lynx-location`, where the device is.
 *
 * `CLLocationManager` on iOS and `LocationManager` on Android — the platform
 * one, deliberately not the fused provider, so the package pulls in no Play
 * Services dependency and works on a device that has none.
 *
 * ## The one idea to take from this screen
 *
 * Nothing here rejects for anything a user can cause. A denial, a device with
 * location switched off, a fix that never came: all three are
 * `{ ok: false, error }` on a **resolved** promise, and a `try`/`catch` around
 * these calls catches none of them. Rejection is reserved for the call not
 * being makeable at all — the module is not linked, or the method is not on the
 * native half this host shipped.
 *
 * The preview reproduces the platform rules that make those branches reachable:
 * a request after a refusal returns the refusal, `locationDisabled` beats a
 * granted permission, and a device with no fix times out rather than answering.
 * It reproduces no provider behaviour whatsoever — `distanceFilter`, `interval`
 * and `accuracy` are recorded and honoured by nothing, because inventing them
 * here would be this app asserting against itself.
 */
export const LocationScreen = (): LynxElement => (
  <Stack gap="md">
    <Prose>
      Two switches, not one: the app's permission and the device's Location Services. A granted app on a device with
      location off gets nothing at all, and telling that user to check their app permissions sends them somewhere that
      looks correct and changes nothing.
    </Prose>
    <Permission />
    <Current />
    <Watching />
    <Geocoding />
  </Stack>
)

/** The two switches, side by side, because that is the confusion. */
const Permission = (): LynxElement => {
  const device = fakeDevice()
  const status = signal<LocationPermissionStatus | 'unread'>('unread')
  const enabled = signal<boolean | null>(null)
  const linked = signal<boolean | null>(null)

  const read = (): void => {
    void getPermissionStatus().then(status)
    void isLocationEnabled().then(enabled)
    void isLocationAvailable().then(linked)
  }

  return (
    <Panel
      title="Permission, the device switch, and the module"
      blurb="getPermissionStatus() is this app's grant. isLocationEnabled() is whether the device does location at all. isLocationAvailable() is whether the native half is even linked into this build."
    >
      <Row>
        <Action onTap={read}>read all three</Action>
        <Action onTap={() => void requestPermission({ precise: true }).then(status)}>requestPermission()</Action>
      </Row>
      <Row>
        <Chip tone={() => (status() === 'granted' ? 'good' : status() === 'unread' ? 'neutral' : 'bad')}>
          {() => `permission: ${status()}`}
        </Chip>
        <Chip tone={() => (enabled() === false ? 'bad' : enabled() === null ? 'neutral' : 'good')}>
          {() => `services: ${enabled() === null ? '—' : enabled() ? 'on' : 'off'}`}
        </Chip>
        <Chip tone={() => (linked() === true ? 'good' : 'neutral')}>
          {() => `linked: ${linked() === null ? '—' : linked()}`}
        </Chip>
      </Row>

      <TextLine class="card-meta">the system's side of it</TextLine>
      <Row gap="xs">
        <Action onTap={() => device.location.setPermissionOutcome('granted')}>the user will allow</Action>
        <Action onTap={() => device.location.setPermissionOutcome('denied')}>the user will refuse</Action>
        <Action onTap={() => device.location.setPermissionOutcome('restricted')}>restricted by MDM</Action>
        <Action onTap={() => device.location.setPermissionStatus('undetermined')}>reinstall the app</Action>
      </Row>
      <Row gap="xs">
        <Action onTap={() => device.location.setLocationEnabled(true)}>services on</Action>
        <Action onTap={() => device.location.setLocationEnabled(false)}>services off</Action>
      </Row>

      <Prose>
        `restricted` is not `denied`. A denial is fixable in Settings, so a settings link is the right thing to offer; a
        restriction is an MDM profile or parental controls the user cannot lift, and that same link is a dead end that
        makes your app look broken rather than the policy.
      </Prose>
      <Prose>
        Ask when the user has just done something that needs a location. One prompt per install on iOS and two
        dismissals on Android, and after that requesting shows nothing at all — which the buttons above will demonstrate
        as many times as you like.
      </Prose>
    </Panel>
  )
}

/** A fix as a union, and the two answers that are not a fix. */
const Current = (): LynxElement => {
  const device = fakeDevice()
  const result = signal<string>('not asked')
  const cached = signal<string>('not asked')

  const ask = (): void => {
    void getCurrentPosition({ accuracy: 'high', timeout: 10_000 }).then((position) =>
      result(
        position.ok ? describe(position.position) : `{ ok: false, error: '${position.error}' } — ${position.message}`,
      ),
    )
  }

  return (
    <Panel
      title="getCurrentPosition"
      blurb="Resolves either way. Branch on `ok` before reading `position`, because the compiler will make you and because the failure is the common path indoors."
    >
      <Row>
        <Action onTap={ask}>getCurrentPosition()</Action>
        <Action onTap={() => void getLastKnownPosition().then((fix) => cached(fix === null ? 'null' : describe(fix)))}>
          getLastKnownPosition()
        </Action>
      </Row>
      <Readout>{() => `getCurrentPosition()  → ${result()}`}</Readout>
      <Readout>{() => `getLastKnownPosition() → ${cached()}`}</Readout>

      <TextLine class="card-meta">the system's side of it</TextLine>
      <Row gap="xs">
        <Action
          onTap={() =>
            device.location.setNextFix({
              latitude: 43.6532,
              longitude: -79.3832,
              accuracy: 12,
              altitude: 76,
              altitudeAccuracy: 8,
              speed: null,
              heading: null,
              timestamp: Date.now(),
            })
          }
        >
          a good fix
        </Action>
        <Action
          onTap={() =>
            device.location.setNextFix({
              latitude: 43.6532,
              longitude: -79.3832,
              accuracy: null,
              altitude: null,
              altitudeAccuracy: null,
              speed: null,
              heading: null,
              timestamp: Date.now(),
            })
          }
        >
          a fix with no accuracy
        </Action>
        <Action onTap={() => device.location.setNextFix(null)}>indoors: no fix at all</Action>
      </Row>

      <Prose>
        Four failures and they want four different screens. `permissionDenied` sends the user to Settings,
        `locationDisabled` sends them to the device switch, `timeout` is worth a retry and usually means indoors, and
        `unavailable` means this build cannot do location at all and the control should not have been offered.
      </Prose>
      <Prose>
        `accuracy` is `number | null` and the null is not decoration: it is the provider saying it does not know how
        wrong this fix is. Treat it as "do not trust this one" rather than as zero, which is what a `?? 0` quietly turns
        it into. `heading` is course over ground rather than a compass, so a stationary device reports null there too.
      </Prose>
    </Panel>
  )
}

/** A stream, and the unsubscribe that is not optional. */
const Watching = (): LynxElement => {
  const device = fakeDevice()
  const updates = signal<readonly string[]>([])
  const watching = signal(false)

  let stop: (() => void) | null = null

  // The fakes are plain objects, so a count read straight out of one is not
  // reactive. `revision` is the preview's one bump-on-every-message signal —
  // reading it first is what makes this line live.
  const nativeWatches = (): number => {
    device.revision()
    return device.location.watches().length
  }

  const toggle = (): void => {
    if (stop) {
      stop()
      stop = null
      watching(false)
      return
    }
    stop = watchPosition(
      (update) =>
        updates([update.ok ? describe(update.position) : `error: ${update.error} — ${update.message}`, ...updates()]),
      { accuracy: 'balanced', distanceFilter: 10 },
    )
    watching(true)
  }

  // Not a nicety: a running watch holds a location provider open, which is the
  // most expensive thing an app can leak on a phone.
  onCleanup(() => stop?.())

  return (
    <Panel
      title="watchPosition"
      blurb="One listener, many fixes — and one function to call when the screen goes away. Navigating off this tab calls it for you, because the subscription is registered with onCleanup."
    >
      <Row>
        <Action onTap={toggle}>{() => (watching() ? 'stop watching' : 'start watching')}</Action>
        <Action
          onTap={() =>
            device.location.emitPosition({
              latitude: 43.6532 + Math.random() / 500,
              longitude: -79.3832 + Math.random() / 500,
              accuracy: 8 + Math.round(Math.random() * 20),
              altitude: 76,
              altitudeAccuracy: 8,
              speed: 1.4,
              heading: 210,
              timestamp: Date.now(),
            })
          }
        >
          the provider reports
        </Action>
        <Action onTap={() => device.location.emitError('timeout', 'the provider lost the sky')}>
          the provider fails
        </Action>
        <Chip tone={() => (watching() ? 'good' : 'neutral')}>
          {() => `${watching() ? 'watching' : 'stopped'} · native watches: ${nativeWatches()}`}
        </Chip>
      </Row>

      <Show when={() => updates().length > 0} fallback={() => <TextLine class="card-meta">no updates</TextLine>}>
        {() => <Readout>{() => updates().slice(0, 6).join('\n')}</Readout>}
      </Show>

      <Prose>
        A watch is a native resource with an id, and stopping it is a call across the bridge rather than a local
        unsubscribe — which is why the count above goes back to zero rather than merely being ignored. Publish a fix
        while stopped and nothing arrives: there is no watch to file it under.
      </Prose>
      <Prose>
        `distanceFilter` is the pacing control that works on both platforms. `interval` is Android's alone — iOS has no
        equivalent and ignores it — so an app that paces by interval gets one behaviour on one platform and a battery
        complaint on the other.
      </Prose>
    </Panel>
  )
}

/** The one call here that needs no permission, and the one most likely to be rate-limited. */
const Geocoding = (): LynxElement => {
  const device = fakeDevice()
  const result = signal<string>('not asked')

  /** Reads the revision first, for the same reason the watch count above does. */
  const lookups = (): number => {
    device.revision()
    return device.location.geocodes().length
  }

  const lookUp = (latitude: number, longitude: number): void => {
    void reverseGeocode({ latitude, longitude }, { locale: 'en-CA' }).then((geocode) =>
      result(
        geocode.ok
          ? (geocode.addresses[0]?.formattedAddress ?? 'an address with no formatted form')
          : `{ ok: false, error: '${geocode.error}' } — ${geocode.message}`,
      ),
    )
  }

  return (
    <Panel
      title="reverseGeocode"
      blurb="It geocodes the coordinates you hand it and never reads the device's own location — so it needs no permission, and asking for one before calling it spends the one-shot prompt on nothing."
    >
      <Row>
        <Action onTap={() => lookUp(43.6532, -79.3832)}>a city hall</Action>
        <Action onTap={() => lookUp(0, 0)}>open water</Action>
        <Action onTap={() => lookUp(91, 0)}>not a coordinate</Action>
      </Row>
      <Readout>{() => `→ ${result()}`}</Readout>

      <TextLine class="card-meta">the system's side of it</TextLine>
      <Row gap="xs">
        <Action onTap={() => device.location.setNetworkAvailable(false)}>lose the network</Action>
        <Action onTap={() => device.location.setNetworkAvailable(true)}>get it back</Action>
        <Action onTap={() => device.location.setGeocoderPresent(false)}>a device with no geocoder</Action>
        <Action onTap={() => device.location.setGeocoderPresent(true)}>one with a geocoder</Action>
        <Chip>{() => `lookups: ${lookups()}`}</Chip>
      </Row>

      <Prose>
        Show `formattedAddress` and store `isoCountryCode`. The first is built by the OS, which already knows where that
        country puts its postcode; the second is stable, where `country` is a display string that changes with the
        device's language and will not match itself after the user switches locale.
      </Prose>
      <Prose>
        Do not call this in a list render. Apple rate-limits `CLGeocoder` per app and starts answering `network` once
        you pass it, and an Android device built without Google's services has no geocoder for the life of the device —
        both buttons above. One lookup per user action, and cache what comes back.
      </Prose>
    </Panel>
  )
}

/** A fix as one line. Coordinates to five places is roughly a metre, which is more than any of these are worth. */
const describe = (fix: LocationFix): string =>
  `${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)} ±${fix.accuracy === null ? 'unknown' : `${fix.accuracy}m`}`
