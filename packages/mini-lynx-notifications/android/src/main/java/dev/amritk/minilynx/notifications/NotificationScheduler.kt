package dev.amritk.minilynx.notifications

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject

/**
 * Arming, re-arming and cancelling the alarms behind scheduled notifications.
 *
 * ## Why alarms rather than the notification manager
 *
 * Android has no "post this later" API. `NotificationManager.notify` is
 * immediate, so anything with a trigger is an `AlarmManager` alarm that fires a
 * broadcast, and `NotificationPublisher` posts the notification when it lands.
 * That is also why `NotificationStore` exists: an alarm carries a
 * `PendingIntent`, not a readable payload, so the records have to be kept
 * alongside.
 *
 * ## Exactness is not promised, and should not be
 *
 * These use `setWindow`/`set` rather than `setExactAndAllowWhileIdle`. From
 * Android 12 an exact alarm needs the `SCHEDULE_EXACT_ALARM` permission, which
 * Google Play restricts to a short list of app categories — alarm clocks and
 * calendars — and which a notifications library has no business asking every
 * host app to justify. Doze can therefore delay a notification, and on a device
 * that has been idle for hours that delay can be long. A reminder is the right
 * use for this; a countdown is not.
 */
internal object NotificationScheduler {
  fun schedule(context: Context, record: JSONObject) {
    val applicationContext = context.applicationContext
    val fireAt = record.optLong("fireAt", 0L)
    val repeats = record.optBoolean("repeats", false)
    val interval = record.optLong("intervalMs", 0L)

    val manager = applicationContext.getSystemService(AlarmManager::class.java) ?: return
    val intent = pendingIntent(applicationContext, record)

    if (repeats && interval > 0L) {
      manager.setInexactRepeating(AlarmManager.RTC_WAKEUP, fireAt, interval, intent)
      return
    }
    // A one-minute window: precise enough for a reminder, and cheap enough that
    // the system can batch it with other work rather than waking the device
    // alone for it.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
      manager.setWindow(AlarmManager.RTC_WAKEUP, fireAt, 60_000L, intent)
    } else {
      manager.set(AlarmManager.RTC_WAKEUP, fireAt, intent)
    }
  }

  fun cancel(context: Context, record: JSONObject) {
    val applicationContext = context.applicationContext
    val manager = applicationContext.getSystemService(AlarmManager::class.java) ?: return
    manager.cancel(pendingIntent(applicationContext, record))
  }

  /**
   * Re-arms everything after a restart, which clears every alarm the system
   * held. Without this a daily reminder stops at the first reboot and nothing
   * anywhere says why.
   */
  fun rearmAll(context: Context, now: Long) {
    NotificationStore.prune(context, now)
    for (record in NotificationStore.all(context)) schedule(context, record)
  }

  private fun pendingIntent(context: Context, record: JSONObject): PendingIntent {
    val intent = Intent(context, NotificationPublisher::class.java).apply {
      action = NotificationPublisher.ACTION_PUBLISH
      putExtra(NotificationPublisher.EXTRA_RECORD, record.toString())
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getBroadcast(context, record.optString("id").hashCode(), intent, flags)
  }
}
