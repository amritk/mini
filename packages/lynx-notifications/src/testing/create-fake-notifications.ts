import type { FakeEmitter } from '@amritk/mini-lynx-native/testing'

import { EVENTS } from '../native-module'
import type {
  DeviceToken,
  Notification,
  NotificationChannel,
  NotificationRequest,
  NotificationResponse,
  PermissionStatus,
  ScheduledNotification,
} from '../types'

/** The fake module, plus the handles a test needs to play the platform's part. */
export type FakeNotifications = {
  /** Register this under `MODULE` in the registry handed to `installNativeBridge`. */
  readonly module: Readonly<Record<string, unknown>>
  /** Sets what the next permission read reports, as the system would. */
  setPermissionStatus(status: PermissionStatus): void
  /** What a `requestPermission` prompt will resolve to. Defaults to `granted`. */
  setPermissionOutcome(status: PermissionStatus): void
  /** Issues a remote-push token, as APNs or FCM would. */
  issueToken(token: DeviceToken): void
  /** Delivers a notification to the foreground app. */
  deliver(notification: Partial<Notification> & { readonly title: string }): void
  /** Acts on a notification, as a user tapping one would. */
  respond(response: Partial<NotificationResponse> & { readonly notification: Notification }): void
  /**
   * Seeds a cold-start tap: a response that arrived before any JavaScript was
   * up, which the native module holds until a subscriber asks for it.
   */
  holdColdStartResponse(response: Partial<NotificationResponse> & { readonly notification: Notification }): void
  /** The notifications currently scheduled. */
  scheduled(): readonly ScheduledNotification[]
  /** The channels created so far, in creation order. */
  channels(): readonly NotificationChannel[]
  /** The current badge number. */
  badge(): number
}

/**
 * An in-memory stand-in for the native notifications module.
 *
 * The point of this is not to test the facade's plumbing — that is four lines
 * per function and the bridge's own suite already covers the wire. It is that
 * **the two native implementations cannot be run here at all**, so the contract
 * between JavaScript and native is otherwise pinned by nothing. This fake is
 * that contract, executable: it implements the same method names, arities and
 * call forms the Kotlin and the Swift do, and the suite drives the real facade
 * against it. A facade that calls `scheduleNotification` with the wrong arity,
 * or reads a field the native side does not send, fails here.
 *
 * What it emphatically does **not** verify is that the Kotlin and the Swift
 * match it. Nothing in this repository can — see `AGENTS.md`.
 *
 * It is exported publicly rather than kept internal because an app testing its
 * own notification screens needs exactly this, and a second copy would be a
 * second thing to keep in step with the native side.
 *
 * @example
 * ```ts
 * const emitter = createFakeEmitter()
 * const notifications = createFakeNotifications(emitter)
 * installNativeBridge({ peer, emitter, modules: { [MODULE]: notifications.module } })
 * ```
 */
export const createFakeNotifications = (emitter: FakeEmitter): FakeNotifications => {
  let status: PermissionStatus = 'undetermined'
  let outcome: PermissionStatus = 'granted'
  let badgeCount = 0
  let nextId = 1
  let token: DeviceToken | null = null

  const scheduled = new Map<string, ScheduledNotification>()
  const channels: NotificationChannel[] = []

  /** A cold-start tap the native side is holding. One slot, cleared on flush. */
  let pendingResponse: NotificationResponse | null = null

  const module = {
    getPermissionStatus: (done: (value: PermissionStatus) => void) => done(status),

    requestPermission: (_request: unknown, done: (value: PermissionStatus) => void) => {
      // The platform's rule, reproduced rather than smoothed over: a request
      // made after a refusal shows nothing and reports the refusal back. A fake
      // that granted on the second ask would hide the bug this causes.
      status = status === 'denied' ? 'denied' : outcome
      done(status)
    },

    getDeviceToken: (done: (value: DeviceToken | null) => void) => done(token),

    scheduleNotification: (request: NotificationRequest, done: (value: string) => void) => {
      const id = request.id ?? `fake-${nextId++}`
      const entry: ScheduledNotification = {
        id,
        title: request.title,
        body: request.body ?? '',
        data: request.data ?? {},
        ...(request.trigger ? { trigger: request.trigger } : {}),
      }
      // Reusing an id replaces rather than appends, as both platforms do.
      scheduled.set(id, entry)
      done(id)
    },

    cancelNotification: (id: string) => {
      scheduled.delete(id)
    },

    cancelAllNotifications: () => {
      scheduled.clear()
    },

    getScheduledNotifications: (done: (value: readonly ScheduledNotification[]) => void) =>
      done([...scheduled.values()]),

    getBadgeCount: (done: (value: number) => void) => done(badgeCount),

    setBadgeCount: (count: number) => {
      badgeCount = count
    },

    createNotificationChannel: (channel: NotificationChannel) => {
      const existing = channels.findIndex((candidate) => candidate.id === channel.id)
      // Android updates only the name and description of a channel that already
      // exists and ignores the rest. Reproduced so a test cannot come to rely
      // on an importance change that a device would discard.
      if (existing >= 0) {
        const previous = channels[existing]
        if (previous) {
          channels[existing] = {
            ...previous,
            name: channel.name,
            ...(channel.description === undefined ? {} : { description: channel.description }),
          }
        }
        return
      }
      channels.push(channel)
    },

    flushPendingResponse: () => {
      const held = pendingResponse
      if (!held) return
      pendingResponse = null
      emitter.emit(EVENTS.response, held)
    },
  } satisfies Record<string, unknown>

  return {
    module,
    setPermissionStatus: (next) => {
      status = next
    },
    setPermissionOutcome: (next) => {
      outcome = next
    },
    issueToken: (next) => {
      token = next
      emitter.emit(EVENTS.token, next)
    },
    deliver: (notification) => {
      emitter.emit(EVENTS.received, {
        id: `fake-${nextId++}`,
        body: '',
        data: {},
        deliveredAt: 0,
        remote: false,
        ...notification,
      } satisfies Notification)
    },
    respond: (response) => {
      emitter.emit(EVENTS.response, {
        action: 'default',
        ...response,
      } satisfies NotificationResponse)
    },
    holdColdStartResponse: (response) => {
      pendingResponse = { action: 'default', ...response }
    },
    scheduled: () => [...scheduled.values()],
    channels: () => channels,
    badge: () => badgeCount,
  }
}
