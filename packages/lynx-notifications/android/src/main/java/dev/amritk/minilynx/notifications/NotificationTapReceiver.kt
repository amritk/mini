package dev.amritk.minilynx.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.lynx.react.bridge.JavaOnlyMap
import org.json.JSONObject

/**
 * Turns a tap into an event JavaScript can route on, and brings the app
 * forward.
 *
 * The receiver sits between the notification and the app's launcher activity
 * rather than launching it directly, because the payload has to be captured
 * whether or not anything is listening yet. `NotificationEvents.emitResponse`
 * decides: publish now if a LynxView is up, hold it for the cold start if not.
 */
internal class NotificationTapReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_TAP) return
    val raw = intent.getStringExtra(EXTRA_RECORD) ?: return
    val record = runCatching { JSONObject(raw) }.getOrNull() ?: return

    val response = JavaOnlyMap()
    response.putMap(
      "notification",
      NotificationPresenter.toNotificationPayload(
        record,
        System.currentTimeMillis(),
        record.optBoolean("remote", false),
      ),
    )
    response.putString("action", DEFAULT_ACTION)
    NotificationEvents.emitResponse(response)

    launchApp(context)
  }

  /**
   * Brings the host app to the front.
   *
   * The launcher intent is resolved from the package manager rather than named,
   * because this library does not know the host's entry activity and must not
   * require it to be registered anywhere. `FLAG_ACTIVITY_NEW_TASK` is mandatory
   * from a receiver, which has no task of its own to start an activity in.
   */
  private fun launchApp(context: Context) {
    val applicationContext = context.applicationContext
    val launch = applicationContext.packageManager
      .getLaunchIntentForPackage(applicationContext.packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    // Reuse the existing task if the app is already running, so a tap resumes
    // the app rather than restarting it and losing everything on screen.
    launch.addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    applicationContext.startActivity(launch)
  }

  companion object {
    const val ACTION_TAP = "dev.amritk.minilynx.notifications.TAP"
    const val EXTRA_RECORD = "record"
    const val DEFAULT_ACTION = "default"
  }
}
