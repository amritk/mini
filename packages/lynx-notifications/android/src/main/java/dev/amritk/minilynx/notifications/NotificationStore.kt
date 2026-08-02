package dev.amritk.minilynx.notifications

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * What the app has scheduled, and what it last set the badge to, kept across
 * process death.
 *
 * Both are here for the same reason: Android does not remember either of them
 * for us. `AlarmManager` holds a `PendingIntent`, not a payload you can read
 * back, so `getScheduledNotifications` has no system list to query — and the
 * launcher badge is not a system concept at all, so `getBadgeCount` has nothing
 * to measure. iOS answers both from the system; on Android the honest answer is
 * "what this app last said", and that is what this stores.
 *
 * A restart clears every alarm, which is why `NotificationBootReceiver` exists:
 * the records survive here and are re-armed from them.
 */
internal object NotificationStore {
  private const val PREFS = "mini-lynx-notifications"
  private const val KEY_SCHEDULED = "scheduled"
  private const val KEY_BADGE = "badge"

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  @Synchronized
  fun put(context: Context, record: JSONObject) {
    val id = record.optString("id")
    val all = all(context).filter { it.optString("id") != id }
    save(context, all + record)
  }

  @Synchronized
  fun remove(context: Context, id: String) {
    save(context, all(context).filter { it.optString("id") != id })
  }

  @Synchronized
  fun clear(context: Context) {
    save(context, emptyList())
  }

  @Synchronized
  fun all(context: Context): List<JSONObject> {
    val raw = prefs(context).getString(KEY_SCHEDULED, null) ?: return emptyList()
    return runCatching {
      val array = JSONArray(raw)
      (0 until array.length()).mapNotNull { array.optJSONObject(it) }
    }.getOrDefault(emptyList())
  }

  /**
   * Drops records whose trigger is in the past and which do not repeat.
   *
   * Without this the list grows forever: a one-shot notification that has
   * already fired is gone from the system but still recorded here, and
   * `getScheduledNotifications` would keep reporting it as pending.
   */
  @Synchronized
  fun prune(context: Context, now: Long) {
    val live = all(context).filter { record ->
      record.optBoolean("repeats", false) || record.optLong("fireAt", 0L) > now
    }
    save(context, live)
  }

  fun badge(context: Context): Int = prefs(context).getInt(KEY_BADGE, 0)

  fun setBadge(context: Context, count: Int) {
    prefs(context).edit().putInt(KEY_BADGE, count).apply()
  }

  private fun save(context: Context, records: List<JSONObject>) {
    val array = JSONArray()
    for (record in records) array.put(record)
    prefs(context).edit().putString(KEY_SCHEDULED, array.toString()).apply()
  }
}
