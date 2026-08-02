package dev.amritk.minilynx.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Re-arms scheduled notifications after a restart.
 *
 * A reboot clears every alarm the system was holding, and nothing tells the app
 * it happened. Without this a daily reminder simply stops the first time the
 * user restarts the phone — a failure with no error, no log, and a report that
 * arrives weeks later as "it worked for a while".
 */
internal class NotificationBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    NotificationScheduler.rearmAll(context.applicationContext, System.currentTimeMillis())
  }
}
