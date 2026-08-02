package dev.amritk.minilynx.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject

/** Posts a scheduled notification when its alarm elapses. */
internal class NotificationPublisher : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_PUBLISH) return
    val raw = intent.getStringExtra(EXTRA_RECORD) ?: return
    val record = runCatching { JSONObject(raw) }.getOrNull() ?: return

    NotificationPresenter.post(context, record)

    // A one-shot notification is no longer pending once it has fired, and
    // leaving it recorded would make `getScheduledNotifications` report it
    // forever. A repeating one stays, because it genuinely is still scheduled.
    if (!record.optBoolean("repeats", false)) {
      NotificationStore.remove(context, record.optString("id"))
    }

    // The app may well be in the foreground when this lands — a scheduled
    // notification does not care what the user is doing — so the same event a
    // remote push would raise is raised here too. A subscriber that shows an
    // in-app treatment should not have to know which of the two it was.
    NotificationEvents.emit(
      NotificationEvents.RECEIVED,
      NotificationPresenter.toNotificationPayload(record, System.currentTimeMillis(), false),
    )
  }

  companion object {
    const val ACTION_PUBLISH = "dev.amritk.minilynx.notifications.PUBLISH"
    const val EXTRA_RECORD = "record"
  }
}
