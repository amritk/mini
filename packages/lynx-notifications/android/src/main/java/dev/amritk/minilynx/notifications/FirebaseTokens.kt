package dev.amritk.minilynx.notifications

import com.google.firebase.messaging.FirebaseMessaging
import com.lynx.react.bridge.JavaOnlyMap

/**
 * The FCM registration token, if this app has Firebase at all.
 *
 * Firebase is a `compileOnly` dependency of this library, so an app that wants
 * only local notifications does not inherit it. That makes every reference in
 * here a class that may genuinely be absent at runtime, and the absence arrives
 * as `NoClassDefFoundError` — an `Error`, not an `Exception`, so a plain
 * `catch (e: Exception)` would not stop it.
 *
 * Catching `Throwable` is normally the wrong instinct and is the right one
 * here: the failure being caught is "this optional dependency is not present",
 * the correct answer to it is `null`, and letting it propagate would crash an
 * app for asking a question it is allowed to ask.
 */
internal object FirebaseTokens {
  fun fetch(onResult: (JavaOnlyMap?) -> Unit) {
    try {
      FirebaseMessaging.getInstance().token
        .addOnCompleteListener { task ->
          val token = if (task.isSuccessful) task.result else null
          onResult(token?.let(::payload))
        }
    } catch (error: Throwable) {
      // No Firebase on the classpath, or no google-services.json to initialise
      // it with. Both mean "no remote push in this build", which is a normal
      // state for a local-notifications-only app rather than a failure.
      onResult(null)
    }
  }

  fun payload(token: String): JavaOnlyMap {
    val map = JavaOnlyMap()
    map.putString("token", token)
    map.putString("service", "fcm")
    return map
  }
}
