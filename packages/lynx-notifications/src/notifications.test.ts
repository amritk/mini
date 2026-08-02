import { resetNativeChannel, setPeerContext } from '@amritk/mini-lynx-native'
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
import { createFakeContexts, createFakeEmitter } from '@amritk/mini-lynx-native/testing'
import { afterEach, describe, expect, it } from 'vitest'

import { cancelAllNotifications } from './cancel-all-notifications'
import { cancelNotification } from './cancel-notification'
import { createNotificationChannel } from './create-notification-channel'
import { getBadgeCount } from './get-badge-count'
import { getDeviceToken } from './get-device-token'
import { getPermissionStatus } from './get-permission-status'
import { getScheduledNotifications } from './get-scheduled-notifications'
import { isNotificationsAvailable } from './is-notifications-available'
import { MODULE } from './native-module'
import { onDeviceToken } from './on-device-token'
import { onNotificationReceived } from './on-notification-received'
import { onNotificationResponse } from './on-notification-response'
import { requestPermission } from './request-permission'
import { scheduleNotification } from './schedule-notification'
import { setBadgeCount } from './set-badge-count'
import { createFakeNotifications, type FakeNotifications } from './testing/create-fake-notifications'
import type { Notification } from './types'

/**
 * These cases drive the real facade over the real bridge against the fake
 * native module, because the thing worth pinning is the contract between them:
 * the method names, their arities, and whether each is a returning or a
 * callback method. Get any of those wrong and the facade compiles, ships, and
 * fails on a device.
 *
 * They cannot tell you the Kotlin and the Swift agree with the fake. Nothing
 * here can — that is what `AGENTS.md` means by the device caveat.
 */

let uninstall: (() => void) | undefined

const setup = (): FakeNotifications => {
  const contexts = createFakeContexts()
  const emitter = createFakeEmitter()
  const notifications = createFakeNotifications(emitter)
  setPeerContext(contexts.mainThread)
  uninstall = installNativeBridge({
    peer: contexts.background,
    emitter,
    modules: { [MODULE]: notifications.module },
  })
  return notifications
}

afterEach(() => {
  uninstall?.()
  uninstall = undefined
  resetNativeChannel()
  setPeerContext(null)
})

describe('notifications', () => {
  it('reports the module as available once it is linked', async () => {
    setup()
    await expect(isNotificationsAvailable()).resolves.toBe(true)
  })

  it('reports the module as unavailable when the host app did not link it', async () => {
    const contexts = createFakeContexts()
    setPeerContext(contexts.mainThread)
    uninstall = installNativeBridge({ peer: contexts.background, modules: {} })

    await expect(isNotificationsAvailable()).resolves.toBe(false)
  })

  it('reads the permission status without prompting', async () => {
    const notifications = setup()
    notifications.setPermissionStatus('provisional')

    await expect(getPermissionStatus()).resolves.toBe('provisional')
  })

  it('resolves with what the user decided when prompted', async () => {
    const notifications = setup()
    notifications.setPermissionOutcome('granted')

    await expect(requestPermission({ alert: true, sound: false })).resolves.toBe('granted')
  })

  it('keeps reporting denied however many times permission is requested', async () => {
    const notifications = setup()
    notifications.setPermissionStatus('denied')
    notifications.setPermissionOutcome('granted')

    // The platform shows no second prompt after a refusal, so an app that
    // retries gets the refusal back rather than another chance.
    await expect(requestPermission()).resolves.toBe('denied')
    await expect(requestPermission()).resolves.toBe('denied')
  })

  it('schedules a notification and returns the id it was filed under', async () => {
    const notifications = setup()

    const id = await scheduleNotification({
      title: 'Standup',
      body: 'In five minutes',
      trigger: { type: 'timeInterval', seconds: 300 },
      data: { screen: 'calendar' },
    })

    expect(notifications.scheduled()).toEqual([
      {
        id,
        title: 'Standup',
        body: 'In five minutes',
        data: { screen: 'calendar' },
        trigger: { type: 'timeInterval', seconds: 300 },
      },
    ])
  })

  it('replaces rather than appends when an id is reused', async () => {
    const notifications = setup()
    await scheduleNotification({ id: 'daily', title: 'Old title' })
    await scheduleNotification({ id: 'daily', title: 'New title' })

    expect(notifications.scheduled()).toHaveLength(1)
    expect(notifications.scheduled()[0]?.title).toBe('New title')
  })

  it('lists the scheduled notifications', async () => {
    setup()
    await scheduleNotification({ id: 'a', title: 'First' })
    await scheduleNotification({ id: 'b', title: 'Second' })

    const pending = await getScheduledNotifications()
    expect(pending.map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('cancels one notification and leaves the rest', async () => {
    const notifications = setup()
    await scheduleNotification({ id: 'a', title: 'First' })
    await scheduleNotification({ id: 'b', title: 'Second' })

    await cancelNotification('a')

    expect(notifications.scheduled().map((entry) => entry.id)).toEqual(['b'])
  })

  it('cancels everything', async () => {
    const notifications = setup()
    await scheduleNotification({ id: 'a', title: 'First' })
    await scheduleNotification({ id: 'b', title: 'Second' })

    await cancelAllNotifications()

    expect(notifications.scheduled()).toEqual([])
  })

  it('reads and writes the badge count', async () => {
    const notifications = setup()

    await setBadgeCount(4)
    expect(notifications.badge()).toBe(4)
    await expect(getBadgeCount()).resolves.toBe(4)

    await setBadgeCount(0)
    await expect(getBadgeCount()).resolves.toBe(0)
  })

  it('creates an Android channel', async () => {
    const notifications = setup()

    await createNotificationChannel({
      id: 'reminders',
      name: 'Reminders',
      importance: 'high',
    })

    expect(notifications.channels()).toEqual([{ id: 'reminders', name: 'Reminders', importance: 'high' }])
  })

  it('ignores everything but the name when a channel already exists', async () => {
    const notifications = setup()
    await createNotificationChannel({ id: 'reminders', name: 'Reminders', importance: 'high' })
    await createNotificationChannel({ id: 'reminders', name: 'Nudges', importance: 'min' })

    expect(notifications.channels()).toEqual([{ id: 'reminders', name: 'Nudges', importance: 'high' }])
  })

  it('delivers a foreground notification to a subscriber', () => {
    const notifications = setup()
    const seen: Notification[] = []
    onNotificationReceived((notification) => seen.push(notification))

    notifications.deliver({ title: 'Order shipped', data: { orderId: '42' } })

    expect(seen).toHaveLength(1)
    expect(seen[0]?.title).toBe('Order shipped')
    expect(seen[0]?.data).toEqual({ orderId: '42' })
  })

  it('hands a tap to a subscriber with the notification data intact', () => {
    const notifications = setup()
    const routed: unknown[] = []
    onNotificationResponse(({ notification }) => routed.push(notification.data['screen']))

    notifications.respond({
      notification: {
        id: 'a',
        title: 'Order shipped',
        body: '',
        data: { screen: 'orders' },
        deliveredAt: 0,
        remote: true,
      },
    })

    expect(routed).toEqual(['orders'])
  })

  it('replays a cold-start tap to the first subscriber', async () => {
    const notifications = setup()
    notifications.holdColdStartResponse({
      notification: {
        id: 'cold',
        title: 'Order shipped',
        body: '',
        data: { screen: 'orders' },
        deliveredAt: 0,
        remote: true,
      },
    })

    const routed: string[] = []
    onNotificationResponse(({ notification }) => routed.push(notification.id))

    // The replay is asked for over the bridge, so it lands a microtask later.
    await Promise.resolve()
    expect(routed).toEqual(['cold'])
  })

  it('replays a held cold-start tap only once', async () => {
    const notifications = setup()
    notifications.holdColdStartResponse({
      notification: {
        id: 'cold',
        title: 'Order shipped',
        body: '',
        data: {},
        deliveredAt: 0,
        remote: true,
      },
    })

    const routed: string[] = []
    onNotificationResponse(({ notification }) => routed.push(notification.id))
    await Promise.resolve()
    onNotificationResponse(({ notification }) => routed.push(notification.id))
    await Promise.resolve()

    expect(routed).toEqual(['cold'])
  })

  it('resolves the device token as null before one is issued', async () => {
    setup()
    await expect(getDeviceToken()).resolves.toBeNull()
  })

  it('reports the token on issue and on every rotation after it', async () => {
    const notifications = setup()
    const tokens: string[] = []
    onDeviceToken((token) => tokens.push(token.token))

    notifications.issueToken({ token: 'first', service: 'apns' })
    notifications.issueToken({ token: 'rotated', service: 'apns' })

    expect(tokens).toEqual(['first', 'rotated'])
    await expect(getDeviceToken()).resolves.toEqual({ token: 'rotated', service: 'apns' })
  })

  it('stops delivering after a subscriber unsubscribes', () => {
    const notifications = setup()
    const seen: Notification[] = []
    const stop = onNotificationReceived((notification) => seen.push(notification))

    notifications.deliver({ title: 'First' })
    stop()
    notifications.deliver({ title: 'Second' })

    expect(seen.map((entry) => entry.title)).toEqual(['First'])
  })
})
