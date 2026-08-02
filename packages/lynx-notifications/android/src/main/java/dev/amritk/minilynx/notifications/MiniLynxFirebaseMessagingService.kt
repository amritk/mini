package dev.amritk.minilynx.notifications

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

/**
 * Remote push arriving from FCM.
 *
 * Only reachable through Firebase's own dispatch, so in a build with no
 * Firebase this class is never loaded — which is what makes the `compileOnly`
 * dependency safe.
 *
 * ## Notification messages versus data messages
 *
 * This handles both, and they behave differently in a way that surprises
 * people. A message with a `notification` block is displayed by the **system**
 * when the app is backgrounded, and `onMessageReceived` is not called at all;
 * the app hears about it only if the user taps. A **data-only** message always
 * reaches `onMessageReceived`, and displaying it is the app's job.
 *
 * So a backend that wants reliable in-app handling should send data-only
 * messages, and one that wants the system to show something even when the app
 * is dead should include a `notification` block. Sending both means the system
 * displays it *and* this runs when the app is foregrounded, which is usually
 * what people actually want.
 */
class MiniLynxFirebaseMessagingService : FirebaseMessagingService() {

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    // FCM rotates tokens on its own schedule, and a rotation the backend never
    // hears about is a device that silently stops receiving push. Publishing it
    // is the whole reason to override this.
    NotificationEvents.emit(NotificationEvents.TOKEN, FirebaseTokens.payload(token))
  }

  override fun onMessageReceived(message: RemoteMessage) {
    super.onMessageReceived(message)

    val record = JSONObject()
    record.put("id", message.messageId ?: message.sentTime.toString())
    record.put("title", message.notification?.title ?: message.data["title"] ?: "")
    record.put("body", message.notification?.body ?: message.data["body"] ?: "")
    record.put("remote", true)

    val data = JSONObject()
    for ((key, value) in message.data) data.put(key, value)
    record.put("data", data)

    message.data["channelId"]?.let { record.put("channelId", it) }

    // A data-only message has nothing on screen yet, so post it. A message that
    // carried a `notification` block reaching here means the app is in the
    // foreground, where the system does NOT display it — so it needs posting
    // too, unless the app would rather handle it itself.
    NotificationPresenter.post(applicationContext, record)

    NotificationEvents.emit(
      NotificationEvents.RECEIVED,
      NotificationPresenter.toNotificationPayload(record, System.currentTimeMillis(), true),
    )
  }
}
