import { getInitialURL, onDeepLink } from '@amritk/lynx-deep-linking'
import { type NotificationResponse, onNotificationResponse } from '@amritk/lynx-notifications'
import { signal } from '@amritk/mini-lynx'

import { fakeDevice } from './fake-device'

/**
 * The two subscriptions that belong to the app root, and nowhere else.
 *
 * A link that arrived with no view up, and a notification the user tapped while
 * the app was not running, are both held natively and replayed **once**, to
 * whoever subscribes first. Both packages say the same thing about that in
 * their `AI.md`, and it is the same mistake: subscribe on the screen the link
 * points at and nothing arrives, because that screen does not exist yet.
 *
 * So the subscription is here — module scope, made at boot, never released —
 * and the screens read what it captured. That is not a shortcut around
 * `onCleanup`: everything a *screen* subscribes to is cleaned up on the screen,
 * and the `/links` and `/notifications` screens each demonstrate that
 * separately. This is the one subscription whose correct lifetime is the
 * process.
 *
 * Keeping it in `lib/` rather than in `app.tsx` is a preview convenience —
 * the screens want to show what it caught, and a signal is easier to hand
 * around than a component's closure. In an app this is four lines at the top of
 * the root component and the handler navigates instead of recording.
 */

/** What the root caught before any screen was up, and everything since. */
export type NativeRoot = {
  /** The URL that launched this process, or null. Null until `getInitialURL` answers. */
  launchURL(): string | null
  /** Links delivered to the running app, newest first. Never includes the launch URL. */
  links(): readonly string[]
  /** Notification taps, newest first — the cold-start one first of all. */
  taps(): readonly NotificationResponse[]
}

let root: NativeRoot | null = null

/** The root's captures, subscribing on first use. Idempotent, and never unsubscribed. */
export const nativeRoot = (): NativeRoot => {
  root ??= subscribe()
  return root
}

const subscribe = (): NativeRoot => {
  // Ordering matters and is easy to get backwards: the device has to exist
  // before anything subscribes through it, or the calls below queue against a
  // channel with no peer. On a device the equivalent is `installNativeBridge()`
  // in the background chunk, which the engine has already run by now.
  fakeDevice()

  const launchURL = signal<string | null>(null)
  const links = signal<readonly string[]>([])
  const taps = signal<readonly NotificationResponse[]>([])

  // Read once, at the root, and never again: it answers the same URL for the
  // whole life of the process, so a screen that reads it on mount re-navigates
  // every time it is mounted.
  void getInitialURL().then(launchURL)

  onDeepLink(({ url }) => links([url, ...links()]))
  onNotificationResponse((response) => taps([response, ...taps()]))

  return { launchURL, links, taps }
}
