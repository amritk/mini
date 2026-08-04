/**
 * The shapes that cross between JavaScript and the native module, in one file
 * so the Kotlin and the Objective-C have a single thing to agree with.
 *
 * Everything here is serialised by the engine on its way across, so every type
 * is plain JSON: no `Date`, no `Map`, no class instance. Timestamps are
 * milliseconds since the epoch for that reason — a `Date` arrives as `{}`.
 */

/**
 * Whether the app may read the device's location.
 *
 * The four states are the union of what the two platforms report, deliberately
 * not flattened to a boolean:
 *
 * - `undetermined` — nobody has been asked yet, so asking is worth doing.
 * - `denied` — the user said no. On both platforms a second prompt does
 *   **nothing**; the only route back is the system settings app.
 * - `granted` — location will be delivered while the app is in use.
 * - `restricted` — iOS only. Location is off for this app by parental controls
 *   or an MDM profile, and the user *cannot* grant it. Worth keeping separate
 *   from `denied` because the honest response differs: a settings link fixes a
 *   denial and does nothing at all for a restriction.
 *
 * Collapsing `denied` and `undetermined` into `false` is the classic mistake
 * here: it produces an app that prompts on every launch and never succeeds.
 */
export type LocationPermissionStatus = 'undetermined' | 'denied' | 'granted' | 'restricted'

/**
 * What to ask for.
 *
 * There is exactly one knob, and it means different things on the two
 * platforms — which is why it is a hint rather than a guarantee.
 */
export type LocationPermissionRequest = {
  /**
   * Ask for a precise fix rather than an approximate one. Defaults to true.
   *
   * On Android this chooses which permission is requested:
   * `ACCESS_FINE_LOCATION` when true, `ACCESS_COARSE_LOCATION` when false. The
   * distinction is real and user-visible — Android 12+ shows "Precise" and
   * "Approximate" as two buttons in the same dialog, and the user may pick the
   * one you did not ask for.
   *
   * On iOS it is **advisory only**. There is one `WhenInUse` prompt with a
   * precise/approximate toggle the user owns, so this cannot change what is
   * shown. Reading `precise` back off a fix is not possible either; judge
   * accuracy from `LocationFix.accuracy` instead, which is what actually
   * arrived.
   */
  readonly precise?: boolean
}

/**
 * How hard to work for a fix.
 *
 * This is a request, not a promise. Both platforms treat accuracy as a hint to
 * their provider selection and neither guarantees the result — what you
 * actually got is `LocationFix.accuracy`, in metres, and it is the only number
 * worth branching on.
 */
export type LocationAccuracy =
  /** GPS where available. Slowest to first fix and hardest on the battery. */
  | 'high'
  /** Network and passive providers, roughly city-block resolution. The default. */
  | 'balanced'
  /** Whatever is already being computed for somebody else. Cheapest, coarsest. */
  | 'low'

/** Options for a single fix. */
export type PositionOptions = {
  /** Defaults to `balanced`. */
  readonly accuracy?: LocationAccuracy
  /**
   * How long to wait before giving up, in milliseconds. Defaults to 15000.
   *
   * A timeout is not a formality: indoors, in a simulator with no location set,
   * or with the radio cold, a high-accuracy request can wait a very long time
   * for a fix that never comes. The result is `{ ok: false, error: 'timeout' }`
   * rather than a rejection.
   */
  readonly timeout?: number
  /**
   * Accept a cached fix this recent instead of waiting for a new one, in
   * milliseconds. Defaults to 0, which always waits.
   *
   * Worth setting for anything that just needs to know roughly where the user
   * is — it turns a multi-second wait into an immediate answer whenever the
   * device already has a recent fix from any app.
   */
  readonly maximumAge?: number
}

/** Options for a continuous watch. */
export type WatchOptions = {
  /** Defaults to `balanced`. */
  readonly accuracy?: LocationAccuracy
  /**
   * Minimum movement between updates, in metres. Defaults to 0 (report every
   * fix the provider produces).
   *
   * The cheapest way to make a watch affordable. A map that redraws on a
   * five-metre change does not need updates from a stationary device, and both
   * platforms enforce this below your code rather than by filtering after the
   * fact.
   */
  readonly distanceFilter?: number
  /**
   * Minimum time between updates, in milliseconds. Defaults to 0.
   *
   * **Android only.** `CLLocationManager` has no equivalent — iOS decides its
   * own cadence from the accuracy and the distance filter — so an app that
   * relies on this for pacing will find it paced only on one platform. Prefer
   * `distanceFilter`, which both honour.
   */
  readonly interval?: number
}

/** A position as the device reported it. */
export type LocationFix = {
  /** Degrees, WGS-84. */
  readonly latitude: number
  /** Degrees, WGS-84. */
  readonly longitude: number
  /**
   * Horizontal accuracy as a radius in metres, at 68% confidence.
   *
   * Nullable because both platforms have a way of saying "I do not know" —
   * `Location.hasAccuracy()` is false on Android, and CoreLocation reports a
   * negative `horizontalAccuracy` — and a fix you cannot judge is worth telling
   * apart from a precise one. In practice every modern provider fills it in, so
   * treat null as "do not trust this fix" rather than as a case to design
   * around.
   */
  readonly accuracy: number | null
  /** Metres above the WGS-84 ellipsoid, or null when the fix carries no altitude. */
  readonly altitude: number | null
  /** Vertical accuracy in metres, or null when unknown. */
  readonly altitudeAccuracy: number | null
  /** Ground speed in metres per second, or null when the device cannot tell. */
  readonly speed: number | null
  /**
   * Direction of travel in degrees clockwise from true north, or null.
   *
   * This is course over ground, **not** compass heading: it is derived from
   * consecutive fixes, so a stationary device reports null or nonsense no
   * matter which way it is pointing.
   */
  readonly heading: number | null
  /** When the fix was taken, in milliseconds since the epoch. */
  readonly timestamp: number
}

/**
 * Why a location request failed.
 *
 * - `permissionDenied` — no permission, or it was revoked mid-watch.
 * - `locationDisabled` — location services are off device-wide, so no app can
 *   have a fix. Distinct from `permissionDenied` because the fix is a different
 *   settings screen and a different sentence to the user.
 * - `timeout` — nothing arrived inside `PositionOptions.timeout`.
 * - `unavailable` — the provider reported a failure of its own, or the native
 *   module is not linked into this host app.
 */
export type LocationErrorCode = 'permissionDenied' | 'locationDisabled' | 'timeout' | 'unavailable'

/**
 * The outcome of a single fix.
 *
 * A discriminated union rather than a rejection, for two reasons. Lynx has no
 * error convention for bridge callbacks — `callNativeAsync` rejects only when
 * the call could not be *made* — so a failure has to travel as a value anyway.
 * And "the user has not granted location" is an ordinary branch in a UI, not an
 * exceptional condition; making it a `throw` pushes every call site into a
 * `try`/`catch` for something that happens on a perfectly normal first launch.
 *
 * @example
 * ```ts
 * const result = await getCurrentPosition()
 * if (result.ok) map.centre(result.position)
 * else if (result.error === 'locationDisabled') promptToEnableLocation()
 * ```
 */
export type LocationResult =
  | { readonly ok: true; readonly position: LocationFix }
  | {
      readonly ok: false
      readonly error: LocationErrorCode
      /** A native-side description. For logs, not for showing to a user. */
      readonly message: string
    }

/**
 * An update from a watch: either a new fix, or the reason the watch has stopped
 * producing them.
 *
 * The failure case is not the end of the subscription. A watch whose provider
 * went away can start producing again — location services being switched back
 * on, for instance — so the listener keeps receiving either way and it is the
 * caller who decides when to unsubscribe.
 */
export type WatchUpdate =
  | { readonly ok: true; readonly position: LocationFix }
  | { readonly ok: false; readonly error: LocationErrorCode; readonly message: string }

/**
 * A point on the globe, in the same degrees `LocationFix` reports.
 *
 * Kept separate from `LocationFix` because reverse geocoding takes coordinates
 * from anywhere — a map centre, a saved venue, a row out of a database — and
 * demanding a whole fix would force a caller to invent an accuracy and a
 * timestamp for a point that never came off a device. Every `LocationFix`
 * satisfies this shape, so handing one straight to `reverseGeocode` works.
 */
export type Coordinates = {
  /** Degrees, WGS-84. Must be between -90 and 90. */
  readonly latitude: number
  /** Degrees, WGS-84. Must be between -180 and 180. */
  readonly longitude: number
}

/** Options for a reverse geocode. */
export type ReverseGeocodeOptions = {
  /**
   * The language the address should come back in, as a BCP-47 tag such as
   * `en-CA` or `fr-CA`. Defaults to the device's own locale.
   *
   * Worth setting when the address is going to be stored or compared rather
   * than shown. A venue geocoded on a French-locale phone and the same venue
   * geocoded on an English one produce different strings for the same place,
   * and a cache keyed on either of them will miss.
   */
  readonly locale?: string
  /**
   * How many addresses to accept. Defaults to 1.
   *
   * More than one is unusual. Both geocoders return their best guess first and
   * the rest are progressively less specific, so a caller that wanted a city
   * name is better served by reading `city` off the first result than by asking
   * for several and picking.
   */
  readonly maxResults?: number
}

/**
 * A postal address as the platform's geocoder described it.
 *
 * Every field is nullable and most of them are usually null, which is the
 * honest shape rather than a defensive one. A geocoder answers from whatever
 * its map data has: a downtown street corner comes back with a house number and
 * a postcode, a field outside a village comes back with a country and perhaps a
 * region, and neither is an error. Code reading these should treat any single
 * field as optional and fall back down the hierarchy.
 *
 * The names are platform-neutral rather than either vendor's. Both geocoders
 * describe the same hierarchy under different spellings — Android's
 * `subAdminArea` is CoreLocation's `subAdministrativeArea`, Android's
 * `featureName` is CoreLocation's `name` — so one set of names is picked here
 * and both native halves map onto it.
 */
export type GeocodeAddress = {
  /**
   * The whole address as one string, formatted the way that country formats
   * addresses.
   *
   * This is the field to show a user. It is built by the OS — `getAddressLine`
   * on Android, `CNPostalAddressFormatter` on iOS — which means it puts the
   * postcode where that country puts the postcode, and a string assembled from
   * the fields below by hand will not.
   */
  readonly formattedAddress: string | null
  /** The place's own name, when it has one: a building, a landmark, a business. */
  readonly name: string | null
  /** House or building number. */
  readonly streetNumber: string | null
  /** Street name. */
  readonly street: string | null
  /** Neighbourhood or borough — a subdivision of the city. */
  readonly district: string | null
  /** City, town or village. */
  readonly city: string | null
  /** County, or the equivalent tier between city and region. */
  readonly subregion: string | null
  /** State, province, or the largest subdivision below the country. */
  readonly region: string | null
  /** Postal or ZIP code. */
  readonly postalCode: string | null
  /** Country name, in whichever language `ReverseGeocodeOptions.locale` asked for. */
  readonly country: string | null
  /**
   * ISO 3166-1 alpha-2 country code, such as `CA`.
   *
   * The one field here that is stable across locales, which makes it the only
   * one worth storing or branching on. `country` is a display string and
   * changes with the device's language.
   */
  readonly isoCountryCode: string | null
}

/**
 * Why a reverse geocode failed.
 *
 * - `invalidCoordinates` — the latitude or longitude was not a finite number in
 *   range. Checked on both native sides before either geocoder is asked,
 *   because Android's `Geocoder` throws on out-of-range input and CoreLocation
 *   quietly answers with nothing.
 * - `notFound` — the geocoder answered, and there is no address there. Open
 *   ocean and most of Antarctica genuinely have none, so this is a normal
 *   result rather than a fault.
 * - `network` — the lookup could not reach the geocoding service. **This also
 *   covers being throttled**, which is not a separate code because only one of
 *   the two platforms can report it: Apple rate-limits `CLGeocoder` per app and
 *   returns a network error once you exceed it, and Android reports nothing of
 *   the kind. A code only one platform can produce is a branch an app writes
 *   and never sees fire.
 * - `unavailable` — this device has no geocoder at all, or the native module is
 *   not linked into the host app. Android devices built without Google's
 *   services frequently have no backend for `Geocoder`, and `Geocoder.isPresent`
 *   is false there for the life of the device — worth failing gracefully over
 *   rather than retrying.
 */
export type GeocodeErrorCode = 'invalidCoordinates' | 'notFound' | 'network' | 'unavailable'

/**
 * The outcome of a reverse geocode.
 *
 * A discriminated union for the same reason `LocationResult` is one: Lynx has
 * no error convention for bridge callbacks, and "there is no address at these
 * coordinates" is an ordinary branch rather than an exceptional condition.
 *
 * `addresses` is never empty on the success side — a geocoder that found
 * nothing is `notFound`, not an empty list. Modelling it the other way would
 * give every call site two spellings of the same outcome to handle, and one of
 * them would eventually get missed.
 *
 * @example
 * ```ts
 * const result = await reverseGeocode({ latitude: 45.5017, longitude: -73.5673 })
 * if (result.ok) label(result.addresses[0]?.formattedAddress ?? 'Unknown')
 * else if (result.error === 'network') label('No connection')
 * ```
 */
export type GeocodeResult =
  | { readonly ok: true; readonly addresses: readonly GeocodeAddress[] }
  | {
      readonly ok: false
      readonly error: GeocodeErrorCode
      /** A native-side description. For logs, not for showing to a user. */
      readonly message: string
    }
