import type { FakeEmitter } from '@amritk/mini-lynx-native/testing'

import { EVENTS } from '../native-module'
import type { OpenResult } from '../types'

/** The fake module, plus the handles a test needs to play the platform's part. */
export type FakeDeepLinking = {
  /** Register this under `MODULE` in the registry handed to `installNativeBridge`. */
  readonly module: Readonly<Record<string, unknown>>
  /** Sets the URL that launched the process, as the system would have delivered it. */
  setInitialURL(url: string | null): void
  /** Delivers a link to a running app — the warm case, with a LynxView up. */
  deliver(url: string): void
  /**
   * Delivers a link with nothing listening, as a link that arrives while the
   * app has no view up does. It is held until `flushPendingLink`, which
   * `onDeepLink` calls when it subscribes.
   */
  hold(url: string): void
  /**
   * The schemes this device can open. Defaults to the four every device has;
   * anything else answers `noHandler`, which is what an undeclared scheme does
   * on both platforms.
   */
  setHandledSchemes(schemes: readonly string[]): void
  /** Every URL handed to `openURL`, in order, including the ones that failed. */
  opened(): readonly string[]
  /** How many times the app's settings page was opened. */
  settingsOpened(): number
}

/** What a device opens without the host app declaring anything. */
const DEFAULT_SCHEMES = ['https', 'http', 'mailto', 'tel', 'sms']

/**
 * An in-memory stand-in for the native deep-linking module.
 *
 * The point of this is not to test the facade's plumbing — that is three lines
 * per function and the bridge's own suite already covers the wire. It is that
 * **the two native implementations cannot be run here at all**, so the contract
 * between JavaScript and native is otherwise pinned by nothing. This fake is
 * that contract, executable: it implements the same method names, arities and
 * call forms the Kotlin and the Objective-C do, and the suite drives the real
 * facade against it. A facade that calls `openURL` with the wrong arity, or
 * reads a field the native side does not send, fails here.
 *
 * What it emphatically does **not** verify is that the Kotlin and the
 * Objective-C match it. Nothing in this repository can — see `AGENTS.md`.
 *
 * ## It reproduces the platforms rather than smoothing them over
 *
 * A scheme the host app never declared fails as `noHandler` even though the
 * "device" could obviously open it, because that is what Android 11's package
 * visibility and iOS's `LSApplicationQueriesSchemes` actually do — and it is
 * the single most common way a working deep link looks broken. A URL with no
 * scheme fails as `invalidURL` rather than being resolved against anything. The
 * launch URL is never published as an event, and the held link is delivered
 * once: both are the rules the native halves implement, and an app that handles
 * a cold-start link twice is the bug they exist to prevent.
 *
 * @example
 * ```ts
 * const emitter = createFakeEmitter()
 * const linking = createFakeDeepLinking(emitter)
 * installNativeBridge({ peer, emitter, modules: { [MODULE]: linking.module } })
 * ```
 */
export const createFakeDeepLinking = (emitter: FakeEmitter): FakeDeepLinking => {
  let initialURL: string | null = null
  let pendingLink: string | null = null
  let handled: readonly string[] = DEFAULT_SCHEMES

  const opened: string[] = []
  let settings = 0

  /** The scheme of a URL, lowercased, or null when it has none. */
  const schemeOf = (url: string): string | null => {
    const matched = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url)
    return matched ? (matched[1] as string).toLowerCase() : null
  }

  const failure = (error: 'invalidURL' | 'noHandler' | 'unavailable', message: string): OpenResult => ({
    ok: false,
    error,
    message,
  })

  const module = {
    getInitialURL: (done: (value: string | null) => void) => done(initialURL),

    // Returning rather than callback-shaped, matching the native halves: there
    // is nothing to wait for, and `onDeepLink` calls it through `callNative`.
    flushPendingLink: () => {
      const held = pendingLink
      if (held === null) return
      pendingLink = null
      emitter.emit(EVENTS.link, { url: held })
    },

    openURL: (url: string, done: (value: OpenResult) => void) => {
      opened.push(url)
      const scheme = schemeOf(url)
      if (scheme === null) {
        done(failure('invalidURL', `no scheme in "${url}"`))
        return
      }
      // Not "is anything installed" but "can this app see anything" — the
      // distinction both platforms enforce and neither explains.
      if (!handled.includes(scheme)) {
        done(failure('noHandler', `nothing handles "${scheme}:"`))
        return
      }
      done({ ok: true })
    },

    canOpenURL: (url: string, done: (value: boolean) => void) => {
      const scheme = schemeOf(url)
      done(scheme !== null && handled.includes(scheme))
    },

    openSettings: (done: (value: boolean) => void) => {
      settings++
      done(true)
    },
  } satisfies Record<string, unknown>

  return {
    module,
    setInitialURL: (url) => {
      initialURL = url
    },
    deliver: (url) => emitter.emit(EVENTS.link, { url }),
    hold: (url) => {
      // One slot, most recent wins — the native buffer's rule. A second link
      // arriving before anything subscribed means the user acted twice, and it
      // is the later action they are waiting on.
      pendingLink = url
    },
    setHandledSchemes: (schemes) => {
      handled = [...schemes]
    },
    opened: () => [...opened],
    settingsOpened: () => settings,
  }
}
