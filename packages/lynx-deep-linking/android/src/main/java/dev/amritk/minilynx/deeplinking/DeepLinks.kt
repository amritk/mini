package dev.amritk.minilynx.deeplinking

import android.content.Intent
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Where every inbound URL enters this library, and the only class a host app
 * ever names.
 *
 * Android delivers a link as an `Intent`, and which callback it lands in
 * depends on the launch mode: a cold start carries it on the launching
 * activity's intent, and a link arriving at an activity that is already up
 * comes through `onNewIntent` — a method **no library can observe**. So the
 * split is:
 *
 * - **Cold start is automatic.** `DeepLinkInitializer` watches the first
 *   activity of the process and captures its intent, so `getInitialURL` works
 *   with no host wiring at all.
 * - **A link into a running app is one line**, and there is no way around it:
 *
 * ```kotlin
 * override fun onNewIntent(intent: Intent) {
 *   super.onNewIntent(intent)
 *   setIntent(intent)
 *   DeepLinks.handleIntent(intent)
 * }
 * ```
 *
 * A host that prefers everything explicit can also call `handleLaunchIntent` in
 * `onCreate`; it is idempotent with the automatic capture, because every intent
 * this object consumes is marked as consumed on the intent itself.
 */
object DeepLinks {
  /**
   * Marks an intent this library has already turned into a URL.
   *
   * The marker rides on the intent rather than in a set here, which is what
   * makes double-wiring safe: the automatic capture and an explicit
   * `handleLaunchIntent` in the host's `onCreate` see the *same* Intent object,
   * so the second one finds the flag and does nothing. A remembered "last URL"
   * could not tell that apart from the user opening the same link twice.
   */
  private const val EXTRA_CONSUMED = "dev.amritk.minilynx.deeplinking.CONSUMED"

  /** Whether the launch intent of this process has been looked at yet. */
  private val launchConsumed = AtomicBoolean(false)

  @Volatile
  private var initialUrl: String? = null

  /** The URL that launched this process, or null. Fixed for the process's lifetime. */
  fun initialURL(): String? = initialUrl

  /**
   * Records the intent that started the process, if it carries a URL.
   *
   * Called automatically for the first activity of the process, and safe for a
   * host to call from `onCreate` as well. Only the first call can set the
   * launch URL: a second activity created later is a running app, and its link
   * is an event rather than a fact about how this process began.
   */
  fun handleLaunchIntent(intent: Intent?) {
    if (!launchConsumed.compareAndSet(false, true)) {
      handleIntent(intent)
      return
    }
    val url = consume(intent) ?: return
    initialUrl = url
  }

  /**
   * Publishes a URL that arrived at a running app.
   *
   * An intent with no data is ignored rather than reported, because that is
   * every ordinary launch: `ACTION_MAIN` from the launcher carries nothing.
   */
  fun handleIntent(intent: Intent?) {
    val url = consume(intent) ?: return
    DeepLinkEvents.link(url)
  }

  /**
   * Publishes a URL a host has already extracted.
   *
   * For hosts that route their own intents, or that receive a link from
   * somewhere Android does not model as an intent at all. Nothing is deduped
   * here — there is no intent to mark — so calling this for an intent the
   * library has already seen will deliver it twice.
   */
  fun handleURL(url: String?) {
    if (url.isNullOrBlank()) return
    DeepLinkEvents.link(url)
  }

  /**
   * The URL on an intent, marking it consumed, or null if there is nothing to
   * take.
   *
   * Two intents are deliberately ignored:
   *
   * - one this library has already consumed, which is what makes the automatic
   *   capture and an explicit host call compose;
   * - one relaunched **from the recents screen**, which Android re-delivers
   *   with the original data attached. Treating that as a new link is how an
   *   app ends up re-opening last week's deep link every time the user swipes
   *   back to it, and the flag is the only way to tell.
   */
  private fun consume(intent: Intent?): String? {
    if (intent == null) return null
    if (intent.getBooleanExtra(EXTRA_CONSUMED, false)) return null
    if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return null
    val url = intent.data?.toString() ?: return null
    intent.putExtra(EXTRA_CONSUMED, true)
    return url
  }
}
