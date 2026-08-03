package dev.amritk.minilynx.location

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
 * ## Why there is no cold-start buffer here
 *
 * `@amritk/lynx-notifications` holds an event that arrives with no view up,
 * because a notification tap is a one-off interaction carrying a destination
 * and losing it is losing the whole point. A location fix is the opposite: it
 * is a sample of something continuous, the next one is a second away, and a
 * stale fix replayed into a screen that has just opened is worse than no fix at
 * all. A watch with nobody listening simply drops its updates, which is also
 * what stopping and restarting one does.
 */
internal object LocationEvents {
  const val POSITION = "mini-lynx:location:position"
  const val ERROR = "mini-lynx:location:error"

  // The failure codes live here too, rather than beside the code that reports
  // them, for the reason the event names do: these are strings JavaScript
  // switches on, and a typo in one is a branch that silently never runs. One
  // file holds every string that crosses, exactly as `native-module.ts` does on
  // the other side. `src/native-contract.test.ts` reads this file to check that
  // both languages know every one of them.
  const val PERMISSION_DENIED = "permissionDenied"
  const val LOCATION_DISABLED = "locationDisabled"
  const val TIMEOUT = "timeout"
  const val UNAVAILABLE = "unavailable"

  // `GeocodeErrorCode`'s three additions, kept beside the four above because
  // they are the same kind of string and splitting them would mean two places
  // to check when one drifts. `UNAVAILABLE` is shared between the two unions
  // deliberately: on both halves of this package it means "this device cannot
  // do that", and a second spelling would be two branches for one outcome.
  const val INVALID_COORDINATES = "invalidCoordinates"
  const val NOT_FOUND = "notFound"
  const val NETWORK = "network"

  private val contexts = mutableListOf<WeakReference<LynxContext>>()

  @Synchronized
  fun register(context: LynxContext) {
    prune()
    if (contexts.none { it.get() === context }) contexts.add(WeakReference(context))
  }

  @Synchronized
  fun unregister(context: LynxContext) {
    contexts.removeAll { it.get() === context || it.get() == null }
  }

  /** Publishes a fix produced by the watch filed under [watchId]. */
  fun position(watchId: String, fix: JavaOnlyMap) {
    val payload = JavaOnlyMap()
    payload.putString("watchId", watchId)
    payload.putMap("position", fix)
    emit(POSITION, payload)
  }

  /**
   * Publishes a failure of the watch filed under [watchId].
   *
   * The watch stays registered afterwards. A provider that went away can come
   * back — location services switched on again, a permission granted from
   * settings — and tearing the watch down on the first failure would mean the
   * app never sees that recovery.
   */
  fun error(watchId: String, code: String, message: String) {
    val payload = JavaOnlyMap()
    payload.putString("watchId", watchId)
    payload.putString("error", code)
    payload.putString("message", message)
    emit(ERROR, payload)
  }

  /** Publishes to every live context. A view that has gone away is dropped rather than kept. */
  @Synchronized
  private fun emit(name: String, payload: JavaOnlyMap) {
    prune()
    val args = JavaOnlyArray()
    args.pushMap(payload)
    for (reference in contexts) {
      reference.get()?.sendGlobalEvent(name, args)
    }
  }

  private fun prune() {
    contexts.removeAll { it.get() == null }
  }
}
