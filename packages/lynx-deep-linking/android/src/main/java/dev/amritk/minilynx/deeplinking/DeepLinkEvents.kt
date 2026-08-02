package dev.amritk.minilynx.deeplinking

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
 * ## Why there is a buffer here, and what it is not for
 *
 * A link can be delivered while the process is alive and no LynxView is — an
 * activity destroyed behind a backgrounded app is the ordinary case. Publishing
 * into that is publishing into nothing, and the link carries a destination the
 * user just chose, so it is held and replayed when JavaScript asks
 * (`flushPendingLink`, called by the facade's `onDeepLink`). Asking is explicit
 * because "has the bundle finished subscribing" is not something native code
 * can guess at, and a delay long enough to be safe is long enough to be seen.
 *
 * It is **not** the cold-start mechanism. The link that launched the process is
 * `DeepLinks.initialURL` — a value read once, never an event — because an app
 * that received it both ways would navigate twice. `@amritk/lynx-notifications`
 * makes the opposite choice for a tap, and the reason is the shape of the data:
 * a notification response is only ever an interaction, while a launch URL is
 * also a fact about how this process started.
 *
 * One link is held, the most recent, and it is cleared on the first flush.
 */
internal object DeepLinkEvents {
  const val LINK = "mini-lynx:deep-linking:link"

  // The failure codes live here too, rather than beside the code that reports
  // them, for the reason the event name does: these are strings JavaScript
  // switches on, and a typo in one is a branch that silently never runs. One
  // file holds every string that crosses, exactly as `native-module.ts` and
  // `types.ts` do on the other side. `src/native-contract.test.ts` reads this
  // file to check that both languages know all three.
  const val INVALID_URL = "invalidURL"
  const val NO_HANDLER = "noHandler"
  const val UNAVAILABLE = "unavailable"

  private val contexts = mutableListOf<WeakReference<LynxContext>>()
  private var pendingLink: String? = null

  @Synchronized
  fun register(context: LynxContext) {
    prune()
    if (contexts.none { it.get() === context }) contexts.add(WeakReference(context))
  }

  @Synchronized
  fun unregister(context: LynxContext) {
    contexts.removeAll { it.get() === context || it.get() == null }
  }

  /** Publishes a link, or holds it when there is no view that could receive one. */
  @Synchronized
  fun link(url: String) {
    prune()
    if (contexts.isEmpty()) {
      pendingLink = url
      return
    }
    emit(url)
  }

  /**
   * Replays a held link, at most once.
   *
   * A view being up is not the same as the bundle having subscribed, and this
   * cannot close that second window — a link that arrives with a view up and no
   * subscriber is lost, which is why the facade subscribes at the app root
   * rather than on the screen the link points at.
   */
  @Synchronized
  fun flushPendingLink() {
    val held = pendingLink ?: return
    pendingLink = null
    emit(held)
  }

  /** Publishes to every live context. A view that has gone away is dropped rather than kept. */
  private fun emit(url: String) {
    val payload = JavaOnlyMap()
    payload.putString("url", url)
    val args = JavaOnlyArray()
    args.pushMap(payload)
    for (reference in contexts) {
      reference.get()?.sendGlobalEvent(LINK, args)
    }
  }

  private fun prune() {
    contexts.removeAll { it.get() == null }
  }
}
