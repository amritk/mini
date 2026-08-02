package dev.amritk.minilynx.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Looper
import androidx.core.content.ContextCompat
import com.lynx.jsbridge.LynxContextModule
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxNativeModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.ReadableMap
import com.lynx.tasm.behavior.LynxContext
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * The Android half of `@amritk/lynx-location`.
 *
 * Every method here is the other end of one function in the package's
 * TypeScript. The names, arities and call forms have to match exactly:
 * `src/testing/create-fake-location.ts` is the executable statement of that
 * contract, and it is what the JavaScript suite runs against.
 *
 * `@LynxNativeModule` registers the module through Lynx's annotation processor,
 * so an app that autolinks this library gets it without writing anything. An
 * app whose build does not run the processor can register it by hand instead:
 *
 * ```kotlin
 * LynxEnv.inst().registerModule("MiniLynxLocationModule", MiniLynxLocationModule::class.java)
 * ```
 *
 * ## Foreground only
 *
 * Nothing here asks for `ACCESS_BACKGROUND_LOCATION` and nothing here starts a
 * foreground service. A watch stops producing when Android stops delivering to
 * a backgrounded app, which is the platform behaving as designed rather than a
 * gap to work around — background location is a separate permission, a separate
 * Play Store declaration, and not something a library should enrol its host in.
 */
@LynxNativeModule(name = "MiniLynxLocationModule")
class MiniLynxLocationModule(context: LynxContext) : LynxContextModule(context) {

  init {
    // The context is what `sendGlobalEvent` needs, and a module instance is
    // per-LynxView, so registering here is what lets events reach every view
    // that is up rather than whichever one happened to be built last.
    LocationEvents.register(context)
  }

  @LynxMethod
  fun getPermissionStatus(callback: Callback) {
    callback.invoke(currentStatus())
  }

  @LynxMethod
  fun requestPermission(request: ReadableMap?, callback: Callback) {
    val status = currentStatus()
    if (status != "undetermined") {
      // Already answered. Android shows nothing on a second ask, so reporting
      // the standing answer is both the truth and what actually happens.
      callback.invoke(status)
      return
    }
    val precise = Options.boolean(Options.read(request), "precise", true)
    LocationPermissionActivity.request(mLynxContext.applicationContext, precise) { granted ->
      callback.invoke(if (granted) "granted" else "denied")
    }
  }

  @LynxMethod
  fun isLocationEnabled(callback: Callback) {
    val manager = locationManager()
    callback.invoke(manager != null && LocationFixes.isLocationEnabled(manager))
  }

  @LynxMethod
  fun getLastKnownPosition(callback: Callback) {
    val manager = locationManager()
    // No permission is no fix rather than an error: the caller was already
    // handling "there is nothing cached", and this is that.
    if (currentStatus() != "granted" || manager == null) {
      callback.invoke(*NO_FIX)
      return
    }
    val location = runCatching { LocationFixes.lastKnown(manager) }.getOrNull()
    if (location == null) callback.invoke(*NO_FIX) else callback.invoke(LocationFixes.toPayload(location))
  }

  @LynxMethod
  fun getCurrentPosition(options: ReadableMap?, callback: Callback) {
    val bag = Options.read(options)
    val status = currentStatus()
    if (status != "granted") {
      callback.invoke(LocationResults.failure(LocationEvents.PERMISSION_DENIED, "location permission is $status"))
      return
    }

    val manager = locationManager()
    if (manager == null) {
      callback.invoke(LocationResults.failure(LocationEvents.UNAVAILABLE, "this device has no location service"))
      return
    }
    // Checked before anything is started, because a granted app on a device
    // with location switched off is the case an app is most likely to report to
    // its user as a permission problem.
    if (!LocationFixes.isLocationEnabled(manager)) {
      callback.invoke(LocationResults.failure(LocationEvents.LOCATION_DISABLED, "location services are off"))
      return
    }

    val maximumAge = Options.long(bag, "maximumAge", 0L)
    if (maximumAge > 0L) {
      val cached = runCatching { LocationFixes.lastKnown(manager) }.getOrNull()
      // Answering from the cache is the difference between an instant map and a
      // three-second one, and it powers nothing up to do it.
      if (cached != null && System.currentTimeMillis() - cached.time <= maximumAge) {
        callback.invoke(LocationResults.success(cached))
        return
      }
    }

    val provider = LocationFixes.providerFor(manager, Options.string(bag, "accuracy", "balanced"))
    if (provider == null) {
      callback.invoke(LocationResults.failure(LocationEvents.UNAVAILABLE, "no enabled location provider"))
      return
    }

    val listener = SingleFixListener(manager, callback, Options.long(bag, "timeout", DEFAULT_TIMEOUT_MS))
    try {
      // The main looper is named explicitly rather than left to the calling
      // thread's: a bridge call arrives on a background thread that has no
      // Looper at all, and `requestLocationUpdates` throws when it cannot find
      // one.
      manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
    } catch (error: SecurityException) {
      // The permission was revoked between the check above and here — rare, but
      // it is a crash if it goes unhandled.
      listener.abandon(LocationEvents.PERMISSION_DENIED, error.message ?: "location permission was revoked")
      return
    }
    listener.arm()
  }

  @LynxMethod
  fun startWatching(options: ReadableMap?, callback: Callback) {
    val bag = Options.read(options)
    val watchId = "watch-${WATCH_IDS.incrementAndGet()}"
    // The id is handed back before any failure is reported, and always. A watch
    // that could not start still has an identity, which is what lets the
    // failure travel as an ordinary update on that watch instead of as a
    // rejected call the facade would have to model separately.
    callback.invoke(watchId)

    val status = currentStatus()
    if (status != "granted") {
      LocationEvents.error(watchId, LocationEvents.PERMISSION_DENIED, "location permission is $status")
      return
    }

    val manager = locationManager()
    if (manager == null) {
      LocationEvents.error(watchId, LocationEvents.UNAVAILABLE, "this device has no location service")
      return
    }
    if (!LocationFixes.isLocationEnabled(manager)) {
      LocationEvents.error(watchId, LocationEvents.LOCATION_DISABLED, "location services are off")
      return
    }

    val provider = LocationFixes.providerFor(manager, Options.string(bag, "accuracy", "balanced"))
    if (provider == null) {
      LocationEvents.error(watchId, LocationEvents.UNAVAILABLE, "no enabled location provider")
      return
    }

    val listener = WatchListener(watchId)
    try {
      manager.requestLocationUpdates(
        provider,
        Options.long(bag, "interval", 0L),
        Options.float(bag, "distanceFilter", 0f),
        listener,
        Looper.getMainLooper(),
      )
    } catch (error: SecurityException) {
      LocationEvents.error(watchId, LocationEvents.PERMISSION_DENIED, error.message ?: "location permission was revoked")
      return
    }
    WATCHES[watchId] = listener
  }

  @LynxMethod
  fun stopWatching(watchId: String) {
    val listener = WATCHES.remove(watchId) ?: return
    val manager = locationManager() ?: return
    runCatching { manager.removeUpdates(listener) }
  }

  private fun locationManager(): LocationManager? =
    mLynxContext.applicationContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager

  /**
   * The current permission, as one of the states the TypeScript declares.
   *
   * `restricted` is never reported here: it is iOS's "an administrator has
   * turned this off and the user cannot turn it back on", and Android has no
   * equivalent state to read.
   *
   * Either permission counts as granted. A user who chose "Approximate" has
   * said yes, and treating that as a refusal would send the app down the
   * explain-and-link-to-settings path for a decision they made deliberately.
   */
  private fun currentStatus(): String {
    val context = mLynxContext.applicationContext
    val granted =
      isGranted(context, Manifest.permission.ACCESS_FINE_LOCATION) ||
        isGranted(context, Manifest.permission.ACCESS_COARSE_LOCATION)
    if (granted) return "granted"
    return if (LocationPermissionState.hasBeenAsked(context)) "denied" else "undetermined"
  }

  private fun isGranted(context: Context, permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  companion object {
    /**
     * Long enough for a cold GPS fix outdoors, short enough that a spinner
     * cannot hang forever. Callers who know better pass `timeout`.
     */
    private const val DEFAULT_TIMEOUT_MS = 15_000L

    /**
     * `Callback.invoke` takes `Object...`, and a bare Kotlin `null` there is
     * read as a null *array* rather than as one null argument. A pre-built
     * single-null array is the unambiguous spelling.
     */
    private val NO_FIX = arrayOfNulls<Any>(1)

    /**
     * Watches are held per process rather than per module instance. A module is
     * created per LynxView, and nothing guarantees that the instance serving
     * `stopWatching` is the one that served `startWatching` — a watch that
     * could not be stopped is a location provider running until the app dies.
     */
    private val WATCHES = ConcurrentHashMap<String, WatchListener>()

    private val WATCH_IDS = AtomicLong(0)
  }
}
