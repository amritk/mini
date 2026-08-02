package dev.amritk.minilynx.notifications

import android.app.NotificationManager
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import com.lynx.react.bridge.Callback
import com.lynx.jsbridge.LynxContextModule
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxNativeModule
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableMap
import com.lynx.tasm.behavior.LynxContext
import org.json.JSONObject
import java.util.UUID

/**
 * The Android half of `@amritk/mini-lynx-notifications`.
 *
 * Every method here is the other end of one function in the package's
 * TypeScript. The names, arities and call forms have to match exactly:
 * `src/testing/create-fake-notifications.ts` is the executable statement of
 * that contract, and it is what the JavaScript suite runs against.
 *
 * `@LynxNativeModule` registers the module through Lynx's annotation processor,
 * so an app that autolinks this library gets it without writing anything. An
 * app whose build does not run the processor can register it by hand instead:
 *
 * ```kotlin
 * LynxEnv.inst().registerModule("MiniLynxNotificationsModule", MiniLynxNotificationsModule::class.java)
 * ```
 */
@LynxNativeModule(name = "MiniLynxNotificationsModule")
class MiniLynxNotificationsModule(context: LynxContext) : LynxContextModule(context) {

  init {
    // The context is what `sendGlobalEvent` needs, and a module instance is
    // per-LynxView, so registering here is what lets events reach every view
    // that is up rather than whichever one happened to be built last.
    NotificationEvents.register(context)
  }

  @LynxMethod
  fun getPermissionStatus(callback: Callback) {
    callback.invoke(currentStatus())
  }

  @LynxMethod
  fun requestPermission(request: ReadableMap?, callback: Callback) {
    // `provisional` is an iOS concept with no Android equivalent, and the rest
    // of the request (alert/badge/sound) is decided per-channel here rather
    // than per-request. Reading it and doing nothing would be worse than
    // ignoring it plainly.
    val status = currentStatus()
    if (status != "undetermined") {
      // Already answered. Android shows nothing on a second ask, so reporting
      // the standing answer is both the truth and what actually happens.
      callback.invoke(status)
      return
    }
    NotificationPermissionActivity.request(mLynxContext.applicationContext) { granted ->
      callback.invoke(if (granted) "granted" else "denied")
    }
  }

  @LynxMethod
  fun getDeviceToken(callback: Callback) {
    FirebaseTokens.fetch(callback::invoke)
  }

  @LynxMethod
  fun scheduleNotification(request: ReadableMap, callback: Callback) {
    val record = Json.toJson(request)
    val id = record.optString("id").ifEmpty { UUID.randomUUID().toString() }
    record.put("id", id)

    val trigger = record.optJSONObject("trigger")
    if (trigger == null) {
      // No trigger means deliver now, which on Android is a direct post rather
      // than an alarm scheduled for the present moment.
      NotificationPresenter.post(mLynxContext.applicationContext, record)
      NotificationEvents.emit(
        NotificationEvents.RECEIVED,
        NotificationPresenter.toNotificationPayload(record, System.currentTimeMillis(), false),
      )
      callback.invoke(id)
      return
    }

    applyTrigger(record, trigger)
    NotificationStore.put(mLynxContext.applicationContext, record)
    NotificationScheduler.schedule(mLynxContext.applicationContext, record)
    callback.invoke(id)
  }

  @LynxMethod
  fun cancelNotification(id: String) {
    val applicationContext = mLynxContext.applicationContext
    NotificationStore.all(applicationContext)
      .firstOrNull { it.optString("id") == id }
      ?.let { NotificationScheduler.cancel(applicationContext, it) }
    NotificationStore.remove(applicationContext, id)
    // Also clear an already-delivered copy: a notification the app considers
    // cancelled should not still be sitting in the shade.
    NotificationManagerCompat.from(applicationContext).cancel(id.hashCode())
  }

  @LynxMethod
  fun cancelAllNotifications() {
    val applicationContext = mLynxContext.applicationContext
    for (record in NotificationStore.all(applicationContext)) {
      NotificationScheduler.cancel(applicationContext, record)
    }
    NotificationStore.clear(applicationContext)
    NotificationManagerCompat.from(applicationContext).cancelAll()
  }

  @LynxMethod
  fun getScheduledNotifications(callback: Callback) {
    val applicationContext = mLynxContext.applicationContext
    NotificationStore.prune(applicationContext, System.currentTimeMillis())

    val list = JavaOnlyArray()
    for (record in NotificationStore.all(applicationContext)) {
      val entry = JavaOnlyMap()
      entry.putString("id", record.optString("id"))
      entry.putString("title", record.optString("title"))
      entry.putString("body", record.optString("body"))
      entry.putMap("data", Json.toJavaOnlyMap(record.optJSONObject("data")))
      record.optJSONObject("trigger")?.let { entry.putMap("trigger", Json.toJavaOnlyMap(it)) }
      list.pushMap(entry)
    }
    callback.invoke(list)
  }

  @LynxMethod
  fun getBadgeCount(callback: Callback) {
    // Android has no system badge to read back — launchers show a dot, a count
    // or nothing, at their own discretion — so the honest answer is what this
    // app last set. See NotificationStore.
    callback.invoke(NotificationStore.badge(mLynxContext.applicationContext))
  }

  @LynxMethod
  fun setBadgeCount(count: Double) {
    NotificationStore.setBadge(mLynxContext.applicationContext, count.toInt())
  }

  @LynxMethod
  fun createNotificationChannel(channel: ReadableMap) {
    val json = Json.toJson(channel)
    NotificationPresenter.ensureChannel(
      mLynxContext.applicationContext,
      json.optString("id"),
      json.optString("name"),
      json.optString("description").ifEmpty { null },
      importanceOf(json.optString("importance")),
      json.optBoolean("badge", true),
    )
  }

  /**
   * Replays a notification tap that arrived before JavaScript could hear it.
   *
   * Called by the facade's `onNotificationResponse` immediately after it
   * subscribes. Native code cannot tell when a bundle has finished subscribing,
   * so being asked is the only reliable signal — see `NotificationEvents`.
   */
  @LynxMethod
  fun flushPendingResponse() {
    NotificationEvents.flushPendingResponse()
  }

  /** Turns a JavaScript trigger into the absolute time and interval an alarm needs. */
  private fun applyTrigger(record: JSONObject, trigger: JSONObject) {
    when (trigger.optString("type")) {
      "timeInterval" -> {
        val seconds = trigger.optDouble("seconds", 0.0)
        val repeats = trigger.optBoolean("repeats", false)
        record.put("fireAt", System.currentTimeMillis() + (seconds * 1000).toLong())
        record.put("repeats", repeats)
        if (repeats) record.put("intervalMs", (seconds * 1000).toLong())
      }
      "date" -> {
        record.put("fireAt", trigger.optLong("timestamp", System.currentTimeMillis()))
        record.put("repeats", false)
      }
      else -> {
        record.put("fireAt", System.currentTimeMillis())
        record.put("repeats", false)
      }
    }
  }

  /**
   * The current permission, as one of the four states the TypeScript declares.
   *
   * `undetermined` and `denied` are genuinely distinguishable only from
   * Android 13, where the runtime permission exists. Below that, notifications
   * are granted at install and the user can still switch them off in settings —
   * which reads as `denied` here, correctly: there is nothing to prompt for and
   * the only route back is settings.
   */
  private fun currentStatus(): String {
    val applicationContext = mLynxContext.applicationContext
    if (!NotificationManagerCompat.from(applicationContext).areNotificationsEnabled()) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "denied"
      return if (NotificationPermissionState.hasBeenAsked(applicationContext)) {
        "denied"
      } else {
        "undetermined"
      }
    }
    return "granted"
  }

  private fun importanceOf(importance: String): Int = when (importance) {
    "min" -> NotificationManager.IMPORTANCE_MIN
    "low" -> NotificationManager.IMPORTANCE_LOW
    "high" -> NotificationManager.IMPORTANCE_HIGH
    else -> NotificationManager.IMPORTANCE_DEFAULT
  }

  override fun destroy() {
    NotificationEvents.unregister(mLynxContext)
    super.destroy()
  }
}
