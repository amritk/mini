package dev.amritk.minilynx.notifications

import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.tasm.behavior.LynxContext
import java.lang.ref.WeakReference

/**
 * The one place native code reaches JavaScript.
 *
 * `LynxContext.sendGlobalEvent` is the only push channel Lynx offers, and the
 * contexts that can carry it are owned by whatever LynxViews happen to be
 * alive. So this holds them weakly and fans out to all of them: a host app may
 * legitimately have more than one view up, and a module instance is per-view.
 *
 * ## The cold-start problem
 *
 * A tap that launches the app is delivered by the system before any JavaScript
 * exists to hear about it — which is precisely the interaction that matters
 * most, because it is the one carrying a destination. Dropping it means every
 * "notification opens the wrong screen" bug there is.
 *
 * So a response that arrives with nothing listening is held here instead, and
 * replayed when JavaScript asks for it. The asking is explicit
 * (`flushPendingResponse`, called by the facade's `onNotificationResponse`)
 * rather than time-based, because "has the bundle finished subscribing" is not
 * something native code can guess at and a delay long enough to be safe is long
 * enough to be visible.
 *
 * The buffer holds exactly one response and is cleared on the first flush. A
 * second subscriber gets nothing, which is correct: the cold-start tap is one
 * event, not a state to be read repeatedly.
 */
internal object NotificationEvents {
  const val RECEIVED = "mini-lynx:notifications:received"
  const val RESPONSE = "mini-lynx:notifications:response"
  const val TOKEN = "mini-lynx:notifications:token"

  private val contexts = mutableListOf<WeakReference<LynxContext>>()
  private var pendingResponse: JavaOnlyMap? = null

  @Synchronized
  fun register(context: LynxContext) {
    prune()
    if (contexts.none { it.get() === context }) contexts.add(WeakReference(context))
  }

  @Synchronized
  fun unregister(context: LynxContext) {
    contexts.removeAll { it.get() === context || it.get() == null }
  }

  /** Publishes to every live context. A view that has gone away is dropped rather than kept. */
  @Synchronized
  fun emit(name: String, payload: JavaOnlyMap) {
    prune()
    val args = JavaOnlyArray()
    args.pushMap(payload)
    for (reference in contexts) {
      reference.get()?.sendGlobalEvent(name, args)
    }
  }

  /**
   * Publishes a response, or holds it if nothing can receive it yet.
   *
   * "Nothing can receive it yet" is deliberately about there being no LynxView
   * at all, not about whether the bundle has subscribed — native code cannot
   * see the latter. A response that arrives with a view up is sent immediately
   * and, if the bundle had not subscribed yet, is lost; that window is the one
   * `flushPendingResponse` cannot close and is why the facade subscribes at the
   * app root rather than on a screen.
   */
  @Synchronized
  fun emitResponse(payload: JavaOnlyMap) {
    prune()
    if (contexts.isEmpty()) {
      pendingResponse = payload
      return
    }
    emit(RESPONSE, payload)
  }

  /** Replays a held cold-start response, at most once. Returns whether there was one. */
  @Synchronized
  fun flushPendingResponse(): Boolean {
    val held = pendingResponse ?: return false
    pendingResponse = null
    emit(RESPONSE, held)
    return true
  }

  private fun prune() {
    contexts.removeAll { it.get() == null }
  }
}
