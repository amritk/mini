/**
 * `@amritk/lynx-location` — device location for Lynx.
 *
 * Lynx ships no location module, and neither does Sparkling: its built-ins stop
 * at navigation, storage and media, and everything else is a Sparkling Method
 * you write yourself. The official answer is "write native code and send it
 * into your Lynx code", so that is what this package is: an Android module, an
 * iOS module, and a promise-shaped facade that reaches them.
 *
 * ## What you have to wire up
 *
 * Two things, once each.
 *
 * ```ts
 * // 1. background chunk — the bridge that carries every call
 * import { installNativeBridge } from '@amritk/mini-lynx-native/background'
 *
 * installNativeBridge()
 * ```
 *
 * ```tsx
 * // 2. anywhere on the main thread — the app itself
 * import { getCurrentPosition, getPermissionStatus, requestPermission } from '@amritk/lynx-location'
 *
 * if ((await getPermissionStatus()) === 'undetermined') await requestPermission()
 * const result = await getCurrentPosition({ accuracy: 'high' })
 * if (result.ok) console.log(result.position.latitude, result.position.longitude)
 * ```
 *
 * The native side links itself: `lynx.lib.json` in this package declares the
 * Android and iOS sources, and Lynx's autolinking picks them up. What it cannot
 * do for you is the iOS usage description — `NSLocationWhenInUseUsageDescription`
 * in the host app's `Info.plist`, without which iOS terminates the app the
 * first time it asks. `README.md` has the full host-app setup.
 *
 * ## Foreground only, on purpose
 *
 * This is `WhenInUse` on iOS and foreground-only on Android. Background
 * location is a second prompt, a Play Store declaration and an App Review
 * conversation, and none of those are things a library should quietly enrol an
 * app in. Geofencing and background tracking want their own native module.
 *
 * ## Why there are no signals here
 *
 * Because a second edge onto the signal engine is how a consumer ends up with
 * two reactive graphs that cannot see each other's writes — a failure that
 * typechecks, runs, and silently stops updating. `@amritk/mini-helpers` is kept
 * off `alien-signals` for exactly this reason and this package follows it: the
 * surface is promises and subscriptions, and turning that into a signal is one
 * line in an app that already has one.
 *
 * ```ts
 * const position = signal<LocationFix | null>(null)
 * onCleanup(watchPosition((update) => { if (update.ok) position(update.position) }))
 * ```
 *
 * It also means the package works unchanged from ReactLynx, Vue Lynx, or plain
 * background-thread code, which a signals-shaped API would not.
 */
export { getCurrentPosition } from './get-current-position'
export { getLastKnownPosition } from './get-last-known-position'
export { getPermissionStatus } from './get-permission-status'
export { isLocationAvailable } from './is-location-available'
export { isLocationEnabled } from './is-location-enabled'
export { EVENTS, MODULE } from './native-module'
export { requestPermission } from './request-permission'
export type {
  LocationAccuracy,
  LocationErrorCode,
  LocationFix,
  LocationPermissionRequest,
  LocationPermissionStatus,
  LocationResult,
  PositionOptions,
  WatchOptions,
  WatchUpdate,
} from './types'
export { watchPosition } from './watch-position'
