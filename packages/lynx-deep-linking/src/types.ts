/**
 * The shapes that cross between JavaScript and the native module, in one file
 * so the Kotlin and the Objective-C have a single thing to agree with.
 *
 * Everything here is serialised by the engine on its way across, so every type
 * is plain JSON: no `URL`, no `Map`, no class instance. A URL is a string for
 * that reason — and because `URL` is a web platform global that a native
 * JavaScript engine is under no obligation to provide. `parseURL` is this
 * package's answer to needing the parts.
 */

/**
 * A URL the system handed to the app.
 *
 * An object rather than a bare string because a link has more that could be
 * said about it later — which system route delivered it, what claimed it — and
 * a listener signature is the hardest thing here to change once apps depend on
 * it. Today there is exactly one field.
 */
export type DeepLink = {
  /** The URL exactly as the system delivered it, undecoded and unparsed. */
  readonly url: string
}

/**
 * Why handing a URL to the system failed.
 *
 * - `invalidURL` — the string is not a URL the platform can parse, which in
 *   practice means it has no scheme. A relative path is the common cause: there
 *   is nothing for the system to route on.
 * - `noHandler` — nothing on the device claims that scheme. An app that is not
 *   installed, a `tel:` on a tablet with no dialler, or — the one that catches
 *   people — a scheme the host app never declared it wanted to see. See
 *   `canOpenURL`, which fails the same way for the same reason.
 * - `unavailable` — the platform refused for a reason of its own, or the native
 *   module is not linked into this host app.
 */
export type OpenErrorCode = 'invalidURL' | 'noHandler' | 'unavailable'

/**
 * The outcome of asking the system to open a URL.
 *
 * A discriminated union rather than a rejection, for the reason
 * `@amritk/lynx-location`'s `LocationResult` is one: Lynx has no error
 * convention for bridge callbacks — `callNativeAsync` rejects only when the
 * call could not be *made* — so a failure has to travel as a value anyway. And
 * "no app on this device opens that" is an ordinary branch in a UI, not an
 * exceptional condition; making it a `throw` pushes every call site into a
 * `try`/`catch` for something a perfectly healthy device does.
 *
 * @example
 * ```ts
 * const result = await openURL('mailto:support@example.com')
 * if (!result.ok && result.error === 'noHandler') showEmailAddressInstead()
 * ```
 */
export type OpenResult =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly error: OpenErrorCode
      /** A native-side description. For logs, not for showing to a user. */
      readonly message: string
    }

/**
 * A URL taken apart, as `parseURL` reports it.
 *
 * The field that surprises people is `host`, and it is worth reading the note
 * on `parseURL` before routing on any of this: in `myapp://profile/42` the
 * `profile` is the **host**, not the first path segment, because a `//` opens
 * an authority component and the URL grammar does not care that a custom scheme
 * has no such thing as a host.
 */
export type ParsedURL = {
  /** `myapp` in `myapp://x`, `https` in `https://x`. Null when the string carries no scheme. */
  readonly scheme: string | null
  /** The authority, or null when the URL has no `//`. Empty authorities (`myapp:///a`) report null. */
  readonly host: string | null
  /** Everything from the authority to the query, `/`-prefixed when there was an authority. Never null; `''` when absent. */
  readonly path: string
  /** The query string parsed into a flat record. Repeated keys keep the last value. */
  readonly query: Readonly<Record<string, string>>
  /** Everything after `#`, decoded, or null when there was no fragment. */
  readonly fragment: string | null
}

/** The parts `createURL` will append to a scheme. */
export type CreateURLOptions = {
  /**
   * The authority to put between `//` and the path.
   *
   * Rarely wanted for a custom scheme and always wanted for `https`. Leaving it
   * out produces `myapp://path/here`, which is the spelling every OAuth
   * provider's redirect-URI field expects — and in which the first segment is
   * the host as far as any parser is concerned.
   */
  readonly host?: string
  /** Appended as a percent-encoded query string. Empty records add no `?`. */
  readonly query?: Readonly<Record<string, string>>
  /** Appended after a `#`, percent-encoded. */
  readonly fragment?: string
}
