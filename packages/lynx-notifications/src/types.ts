/**
 * The shapes that cross between JavaScript and the native module, in one file
 * so the Kotlin and the Swift have a single thing to agree with.
 *
 * Everything here is serialised by the engine on its way across, so every type
 * is plain JSON: no `Date`, no `Map`, no class instance. Timestamps are
 * milliseconds since the epoch for that reason — a `Date` arrives as `{}`.
 */

/**
 * Whether the app may post notifications.
 *
 * The four states are the union of what the two platforms report, deliberately
 * not flattened to a boolean:
 *
 * - `undetermined` — nobody has been asked yet, so asking is worth doing.
 * - `denied` — the user said no. On both platforms a second prompt does
 *   **nothing**; the only route back is the system settings app.
 * - `granted` — notifications will be delivered.
 * - `provisional` — iOS only. Granted quietly without a prompt, but delivered
 *   to the notification centre rather than as a banner. Treat it as granted for
 *   scheduling and as not-yet-granted for anything that needs to interrupt.
 *
 * Collapsing `denied` and `undetermined` into `false` is the classic mistake
 * here: it produces an app that prompts on every launch and never succeeds.
 */
export type PermissionStatus = 'undetermined' | 'denied' | 'granted' | 'provisional'

/** What to ask for. Android reads none of it — its runtime prompt is all-or-nothing. */
export type PermissionRequest = {
  /** Banners and alerts. iOS default true. */
  readonly alert?: boolean
  /** The app-icon badge. iOS default true. */
  readonly badge?: boolean
  /** Notification sounds. iOS default true. */
  readonly sound?: boolean
  /**
   * Ask for provisional authorisation instead: no prompt, quiet delivery.
   * iOS only, and it cannot be combined with a normal request — the system
   * shows no prompt at all, so `requestPermission` resolves `provisional`
   * without the user ever seeing anything.
   */
  readonly provisional?: boolean
}

/**
 * When a scheduled notification should fire. Omit it and the notification is
 * posted immediately.
 *
 * Only two triggers exist here on purpose. Calendar and location triggers are
 * where a notifications API stops being small — they differ substantially
 * between the platforms and need their own permission on iOS — and an app that
 * needs them is better served reaching for the native module directly than by
 * this package growing a lowest-common-denominator version of both.
 */
export type NotificationTrigger =
  /** Fire after a delay. `repeats` needs `seconds` >= 60 on both platforms. */
  | { readonly type: 'timeInterval'; readonly seconds: number; readonly repeats?: boolean }
  /** Fire at a wall-clock moment, as milliseconds since the epoch. */
  | { readonly type: 'date'; readonly timestamp: number }

/** A notification to post or schedule. */
export type NotificationRequest = {
  /**
   * The identifier to file it under. Generated when omitted, and returned by
   * `scheduleNotification` either way.
   *
   * Reusing an id **replaces** the notification already under it on both
   * platforms, which is the mechanism for updating a live notification rather
   * than a mistake to avoid.
   */
  readonly id?: string
  readonly title: string
  readonly body?: string
  /** Carried through delivery and handed back on the tap. Must be JSON. */
  readonly data?: Readonly<Record<string, unknown>>
  /** Play the default sound. Defaults to true. */
  readonly sound?: boolean
  /** Set the app-icon badge to this number as the notification is delivered. */
  readonly badge?: number
  /**
   * Which Android channel to post on. Ignored on iOS.
   *
   * Android 8+ **drops a notification with no valid channel, silently**, so a
   * request that omits this goes to a default channel the native module creates
   * on demand. Any app that wants its own categories should call
   * `createNotificationChannel` at startup and name the channel here.
   */
  readonly channelId?: string
  /** Omit to deliver immediately. */
  readonly trigger?: NotificationTrigger
}

/** A notification as it was delivered. */
export type Notification = {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly data: Readonly<Record<string, unknown>>
  /** When it was delivered, in milliseconds since the epoch. */
  readonly deliveredAt: number
  /** True when it came from APNs or FCM rather than from a local schedule. */
  readonly remote: boolean
}

/** A notification still waiting to fire. */
export type ScheduledNotification = {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly data: Readonly<Record<string, unknown>>
  readonly trigger?: NotificationTrigger
}

/** What the user did with a notification. */
export type NotificationResponse = {
  readonly notification: Notification
  /**
   * Which action was used. `'default'` means the notification body itself was
   * tapped, which is the only case both platforms report without extra setup.
   */
  readonly action: string
  /** What the user typed, for a text-input action. */
  readonly text?: string
}

/** The device's remote-push registration. */
export type DeviceToken = {
  /**
   * The token, hex-encoded on iOS and passed through verbatim on Android.
   *
   * It is **not** stable: iOS reissues it on reinstall and restore, and FCM
   * rotates it on its own schedule. Treat every arrival from `onDeviceToken` as
   * the current truth and re-send it to your backend, rather than storing the
   * first one and assuming it holds.
   */
  readonly token: string
  /** Which service issued it, and therefore which one your backend must send through. */
  readonly service: 'apns' | 'fcm'
}

/**
 * An Android notification channel. Ignored on iOS, where the equivalent
 * grouping is a category and is configured on the notification itself.
 *
 * Channels are **immutable after creation**: Android ignores every field but
 * the name and description on a channel that already exists, and the only way
 * to change an importance is to delete the channel — which loses the user's own
 * customisations — or to create a new one under a new id. Get the importance
 * right the first time.
 */
export type NotificationChannel = {
  readonly id: string
  readonly name: string
  readonly description?: string
  /**
   * How loudly it announces itself. `default` and above make a sound; `high`
   * additionally shows a heads-up banner.
   */
  readonly importance?: 'min' | 'low' | 'default' | 'high'
  /** Show a badge on the launcher icon for this channel. Defaults to true. */
  readonly badge?: boolean
}
