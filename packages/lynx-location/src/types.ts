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
