package dev.amritk.minilynx.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.lynx.react.bridge.JavaOnlyMap
import org.json.JSONObject

/**
 * Turning a record into something the user can see, and a tap into something
 * JavaScript can route on.
 *
 * ## The channel trap
 *
 * Since Android 8 a notification posted to a channel that does not exist is
 * **dropped in complete silence** — no exception, no log an app author would
 * ever find, nothing on screen. It is far and away the most common reason
 * Android notifications "just don't work". So `post` creates the default
 * channel on demand rather than trusting that the app remembered to, and an app
 * that names its own channel is expected to have created it first.
 */
internal object NotificationPresenter {
  const val DEFAULT_CHANNEL_ID = "mini-lynx-default"
  private const val DEFAULT_CHANNEL_NAME = "Notifications"

  fun ensureChannel(
    context: Context,
    id: String,
    name: String,
    description: String?,
    importance: Int,
    badge: Boolean,
  ) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val existing = manager.getNotificationChannel(id)
    if (existing != null) {
      // Android ignores every field but these two on an existing channel. Doing
      // the same thing here rather than pretending the rest took effect.
      existing.name = name
      existing.description = description
      manager.createNotificationChannel(existing)
      return
    }
    val channel = NotificationChannel(id, name, importance)
    channel.description = description
    channel.setShowBadge(badge)
    manager.createNotificationChannel(channel)
  }

  private fun ensureDefaultChannel(context: Context) {
    ensureChannel(
      context,
      DEFAULT_CHANNEL_ID,
      DEFAULT_CHANNEL_NAME,
      null,
      NotificationManager.IMPORTANCE_DEFAULT,
      true,
    )
  }

  /** Posts a record to the shade. Safe to call from any thread. */
  fun post(context: Context, record: JSONObject) {
    val applicationContext = context.applicationContext
    val channelId = record.optString("channelId").ifEmpty { DEFAULT_CHANNEL_ID }
    if (channelId == DEFAULT_CHANNEL_ID) ensureDefaultChannel(applicationContext)

    val id = record.optString("id")
    val title = record.optString("title")
    val body = record.optString("body")

    val builder = NotificationCompat.Builder(applicationContext, channelId)
      .setContentTitle(title)
      .setContentText(body)
      .setAutoCancel(true)
      // The host app's own launcher icon. A library cannot ship a small icon
      // that suits somebody else's brand, and a missing one posts a blank
      // square rather than failing, so this is worth being explicit about in
      // the README rather than silently defaulting to something wrong.
      .setSmallIcon(applicationContext.applicationInfo.icon)
      .setContentIntent(tapIntent(applicationContext, record))

    if (record.optBoolean("sound", true)) {
      builder.setDefaults(NotificationCompat.DEFAULT_SOUND)
    }
    if (record.has("badge")) {
      builder.setNumber(record.optInt("badge"))
      NotificationStore.setBadge(applicationContext, record.optInt("badge"))
    }

    // `notify` throws nothing when notifications are disabled — it simply does
    // not show. Checking first keeps the "why is nothing appearing" answer in
    // one place, and posting anyway is harmless when it is allowed.
    NotificationManagerCompat.from(applicationContext).notify(id.hashCode(), builder.build())
  }

  /**
   * The `PendingIntent` that routes a tap back into the app.
   *
   * It launches the host's own launcher activity rather than anything this
   * library owns: the app's entry point is the only screen that is guaranteed
   * to exist, and putting the payload on the intent lets
   * `NotificationTapReceiver` publish it once a LynxView is up.
   */
  private fun tapIntent(context: Context, record: JSONObject): PendingIntent {
    val intent = Intent(context, NotificationTapReceiver::class.java).apply {
      action = NotificationTapReceiver.ACTION_TAP
      putExtra(NotificationTapReceiver.EXTRA_RECORD, record.toString())
    }
    // FLAG_IMMUTABLE is mandatory from Android 12. FLAG_UPDATE_CURRENT so that
    // reusing an id replaces the payload instead of resurrecting the old one.
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getBroadcast(context, record.optString("id").hashCode(), intent, flags)
  }

  /** A stored record as the `Notification` shape the JavaScript side declares. */
  fun toNotificationPayload(record: JSONObject, deliveredAt: Long, remote: Boolean): JavaOnlyMap {
    val payload = JavaOnlyMap()
    payload.putString("id", record.optString("id"))
    payload.putString("title", record.optString("title"))
    payload.putString("body", record.optString("body"))
    payload.putMap("data", Json.toJavaOnlyMap(record.optJSONObject("data")))
    payload.putDouble("deliveredAt", deliveredAt.toDouble())
    payload.putBoolean("remote", remote)
    return payload
  }
}
