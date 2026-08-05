import {
  cancelAllNotifications,
  cancelNotification,
  createNotificationChannel,
  getBadgeCount,
  getDeviceToken,
  getPermissionStatus,
  getScheduledNotifications,
  isNotificationsAvailable,
  type Notification,
  onDeviceToken,
  onNotificationReceived,
  type PermissionStatus,
  requestPermission,
  type ScheduledNotification,
  scheduleNotification,
  setBadgeCount,
} from '@amritk/lynx-notifications'
import { type LynxElement, onCleanup, signal } from '@amritk/mini-lynx'
import { For, Show } from '@amritk/mini-lynx/flow'

import { Action, Chip, Panel, Prose, Readout, Row, Stack, TextLine } from '../components'
import { fakeDevice } from '../lib/fake-device'
import { nativeRoot } from '../lib/native-root'

/**
 * `/notifications` — `@amritk/lynx-notifications`, local and remote push.
 *
 * The package is a promise-shaped facade over a native module on each platform:
 * `UNUserNotificationCenter` and APNs on iOS, `NotificationManager`,
 * `AlarmManager` and FCM on Android. Nothing here is reactive and nothing here
 * is synchronous — the module lives in the background context, so every read
 * crosses the bridge on the previous screen.
 *
 * ## What the preview can show
 *
 * Every rule the two platforms enforce that the package's fake reproduces: the
 * one-shot permission prompt, a channel that cannot be edited after creation, a
 * reused id replacing rather than appending, a cold-start tap replayed exactly
 * once. Those are the rules an app gets wrong, and they are all reachable from
 * the buttons below.
 *
 * What it cannot show is a notification. No banner is presented, no sound is
 * played, nothing is scheduled with an operating system and nothing survives a
 * reload — and on a device the Kotlin and the Objective-C on the other side of
 * this have never run at all.
 */
export const NotificationsScreen = (): LynxElement => (
  <Stack gap="md">
    <Prose>
      The permission is a one-shot on both platforms and the tap that opens your app may have happened before your app
      existed. Those two facts decide the shape of every notification screen ever written, and both are pressable here.
    </Prose>
    <Permission />
    <Channels />
    <Scheduling />
    <Arrivals />
    <Taps />
    <Token />
    <Badge />
  </Stack>
)

/**
 * The one-shot, and the four statuses that are not a boolean.
 *
 * `provisional` is iOS's quiet grant — delivered, but to the notification
 * centre rather than to a banner — and collapsing it into `denied` turns a
 * working app into one that believes it cannot notify.
 */
const Permission = (): LynxElement => {
  const device = fakeDevice()
  const status = signal<PermissionStatus | 'unread'>('unread')
  const available = signal<boolean | null>(null)

  const read = (): void => void getPermissionStatus().then(status)
  const ask = (): void => void requestPermission({ alert: true, badge: true, sound: true }).then(status)

  return (
    <Panel
      title="You get one prompt, ever"
      blurb="Check the status first and branch: undetermined → ask, denied → explain and send them to settings. Asking unconditionally on launch is the classic bug, and it never recovers."
    >
      <Row>
        <Action onTap={read}>getPermissionStatus()</Action>
        <Action onTap={ask}>requestPermission()</Action>
        <Action onTap={() => void isNotificationsAvailable().then(available)}>isNotificationsAvailable()</Action>
      </Row>
      <Row>
        <Chip
          tone={() =>
            status() === 'granted' || status() === 'provisional' ? 'good' : status() === 'denied' ? 'bad' : 'neutral'
          }
        >
          {() => `status: ${status()}`}
        </Chip>
        <Chip tone={() => (available() === true ? 'good' : 'neutral')}>
          {() => `linked: ${available() === null ? '—' : available()}`}
        </Chip>
      </Row>

      <TextLine class="card-meta">the system's side of it</TextLine>
      <Row gap="xs">
        <Action onTap={() => device.notifications.setPermissionOutcome('granted')}>the user will allow</Action>
        <Action onTap={() => device.notifications.setPermissionOutcome('denied')}>the user will refuse</Action>
        <Action onTap={() => device.notifications.setPermissionOutcome('provisional')}>iOS provisional</Action>
        <Action onTap={() => device.notifications.setPermissionStatus('undetermined')}>reinstall the app</Action>
      </Row>

      <Prose>
        Set the outcome to refuse, ask, then set it back to allow and ask again: the second request resolves `denied`
        without showing anything, because that is what both platforms do with it. Only reinstalling — the last button —
        puts the prompt back, which is why "ask again later" is not a recovery path and a settings link is.
      </Prose>
    </Panel>
  )
}

/** Android's silent drop, and the reason the call is unconditional. */
const Channels = (): LynxElement => {
  const device = fakeDevice()
  const created = signal<readonly string[]>([])

  const refresh = (): void =>
    created(
      device.notifications
        .channels()
        .map((channel) => `${channel.id} · ${channel.name} · importance ${channel.importance ?? 'default'}`),
    )

  const create = (name: string, importance: 'low' | 'high'): void => {
    void createNotificationChannel({ id: 'builds', name, description: 'Build results', importance }).then(refresh)
  }

  return (
    <Panel
      title="A channel, or Android drops it in silence"
      blurb="No error, no log, no notification. Create the channels at startup and unconditionally — the call is a no-op on iOS, so there is nothing to branch on."
    >
      <Row>
        <Action onTap={() => create('Builds', 'high')}>create “Builds”, high</Action>
        <Action onTap={() => create('Build results', 'low')}>same id, new name, low</Action>
      </Row>
      <Show when={() => created().length > 0} fallback={() => <TextLine class="card-meta">no channels yet</TextLine>}>
        {() => <Readout>{() => created().join('\n')}</Readout>}
      </Show>
      <Prose>
        The second button renames the channel and its importance stays `high`, because a channel is immutable after
        creation everywhere except its name and description. Getting the importance wrong therefore means shipping a new
        id — and living with the old one still sitting in the user's settings.
      </Prose>
    </Panel>
  )
}

/** Scheduling, cancelling, and the id that replaces rather than appends. */
const Scheduling = (): LynxElement => {
  const scheduled = signal<readonly ScheduledNotification[]>([])
  const lastId = signal<string>('—')

  const refresh = (): void => void getScheduledNotifications().then(scheduled)

  const schedule = (request: Parameters<typeof scheduleNotification>[0]): void => {
    void scheduleNotification(request).then((id) => {
      lastId(id)
      refresh()
    })
  }

  return (
    <Panel
      title="scheduleNotification"
      blurb="A trigger is a time interval or an instant, and omitting it means now. The id comes back so you can cancel it, or reuse it to update what is already scheduled."
    >
      <Row>
        <Action onTap={() => schedule({ title: 'Deploy finished', body: 'main → production', channelId: 'builds' })}>
          immediately
        </Action>
        <Action
          onTap={() =>
            schedule({
              title: 'Stand-up',
              body: 'in ten minutes',
              channelId: 'builds',
              trigger: { type: 'timeInterval', seconds: 600 },
            })
          }
        >
          in 600s
        </Action>
        <Action
          onTap={() =>
            schedule({
              id: 'nightly',
              title: 'Nightly build',
              body: 'starts at midnight',
              trigger: { type: 'date', timestamp: Date.now() + 3_600_000 },
            })
          }
        >
          id “nightly”, in an hour
        </Action>
      </Row>
      <Row>
        <Action onTap={refresh}>getScheduledNotifications()</Action>
        <Action onTap={() => void cancelNotification('nightly').then(refresh)}>cancel “nightly”</Action>
        <Action onTap={() => void cancelAllNotifications().then(refresh)}>cancel everything</Action>
        <Chip>{() => `last id: ${lastId()}`}</Chip>
      </Row>

      <Show
        when={() => scheduled().length > 0}
        fallback={() => <TextLine class="card-meta">nothing scheduled</TextLine>}
      >
        {() => (
          <For each={scheduled} key={(entry) => entry.id} as="view" class="gap-xs">
            {(entry) => (
              <view class="card">
                <TextLine>{entry.title}</TextLine>
                <TextLine class="card-meta">{`${entry.id} · ${entry.trigger ? entry.trigger.type : 'immediate'}`}</TextLine>
              </view>
            )}
          </For>
        )}
      </Show>

      <Prose>
        Press “id nightly” twice and there is still one row: reusing an id replaces, on both platforms, and that is the
        mechanism for updating a live notification rather than a mistake to avoid. Leave the id out and the platform
        mints one, which is what the other two buttons do — press those twice and you get two.
      </Prose>
      <Prose>
        Android's scheduling is inexact: Doze can hold an alarm well past its time. That is fine for a reminder and
        wrong for anything the user is counting down to, and no API here can paper over it.
      </Prose>
    </Panel>
  )
}

/** The foreground arrival, which is the one nobody sees unless the app draws it. */
const Arrivals = (): LynxElement => {
  const device = fakeDevice()
  const received = signal<readonly Notification[]>([])

  onCleanup(onNotificationReceived((notification) => received([notification, ...received()])))

  return (
    <Panel
      title="A foreground arrival shows no banner"
      blurb="It arrives here instead. Drawing something — a toast, a row, a badge on a tab — is the app's job, and skipping it is why a notification 'did not arrive' while the user was looking at the app."
    >
      <Row>
        <Action
          onTap={() =>
            device.notifications.deliver({
              title: 'Build #1428 passed',
              body: 'All 312 tests green',
              data: { build: '1428' },
              remote: true,
            })
          }
        >
          deliver one now
        </Action>
        <Chip tone={() => (received().length > 0 ? 'good' : 'neutral')}>{() => `received: ${received().length}`}</Chip>
      </Row>
      <Show when={() => received().length > 0} fallback={() => <TextLine class="card-meta">nothing yet</TextLine>}>
        {() => (
          <For each={() => received().slice(0, 4)} key={(entry) => entry.id} as="view" class="gap-xs">
            {(entry) => (
              <view class="card">
                <TextLine>{entry.title}</TextLine>
                <TextLine class="card-meta">{`${entry.body} · ${entry.remote ? 'remote' : 'local'}`}</TextLine>
              </view>
            )}
          </For>
        )}
      </Show>
      <Prose>
        This subscription is made by this screen, so it is released by `onCleanup` when you navigate away — leave it
        attached and every visit to this tab adds another listener that will fire for every future notification. A
        notification that arrives while the app is *backgrounded* does not come through here at all; the only thing you
        hear about that one is the tap, on the panel below.
      </Prose>
    </Panel>
  )
}

/** The tap, and the reason its subscription is not on this screen. */
const Taps = (): LynxElement => {
  const device = fakeDevice()
  const root = nativeRoot()

  return (
    <Panel
      title="The tap that opened the app"
      blurb="Held natively and replayed once, to whoever subscribes first. Subscribe on the screen the notification points at and it is gone — that screen does not exist yet."
    >
      <Row>
        <Action
          onTap={() =>
            device.notifications.respond({
              action: 'default',
              notification: {
                id: `tap-${Date.now()}`,
                title: 'Deploy finished',
                body: 'Tapped while the app was running',
                data: { url: 'miniplayground://app/routing/amritk' },
                deliveredAt: Date.now(),
                remote: true,
              },
            })
          }
        >
          tap one now
        </Action>
        <Chip tone={() => (root.taps().length > 0 ? 'good' : 'neutral')}>{() => `taps: ${root.taps().length}`}</Chip>
      </Row>

      <Show when={() => root.taps().length > 0} fallback={() => <TextLine class="card-meta">no taps</TextLine>}>
        {() => (
          <Readout>
            {() =>
              root
                .taps()
                .slice(0, 5)
                .map((tap) => `${tap.action.padEnd(8)} ${tap.notification.title}`)
                .join('\n')
            }
          </Readout>
        )}
      </Show>

      <Prose>
        The first row is already there when you arrive: the preview seeds a cold-start tap, because a tap that happened
        before any JavaScript ran is the one case no button can reach. It was captured by the subscription this app
        makes at its root, in `src/lib/native-root.ts`, and this screen only reads what that caught.
      </Prose>
      <Prose>
        That is the one subscription whose right lifetime is the process rather than a component. Everything else on
        this screen goes through `onCleanup`; this one is never released, because the thing it is waiting for can arrive
        before the first render and must not be missed while the routing decision is still being made.
      </Prose>
    </Panel>
  )
}

/** The token that rotates, and the null that is not an error. */
const Token = (): LynxElement => {
  const device = fakeDevice()
  const token = signal<string>('not read')
  const pushed = signal<readonly string[]>([])

  onCleanup(onDeviceToken((next) => pushed([`${next.service}: ${next.token}`, ...pushed()])))

  return (
    <Panel
      title="getDeviceToken, and the arrivals after it"
      blurb="APNs on iOS, FCM on Android. Null is a normal answer — no permission, offline, a simulator with no paired Mac, a build with no Firebase."
    >
      <Row>
        <Action
          onTap={() =>
            void getDeviceToken().then((value) => token(value === null ? 'null' : `${value.service}: ${value.token}`))
          }
        >
          getDeviceToken()
        </Action>
        <Action
          onTap={() => device.notifications.issueToken({ token: `apns-${Date.now().toString(36)}`, service: 'apns' })}
        >
          the OS issues one
        </Action>
        <Action
          onTap={() => device.notifications.issueToken({ token: `fcm-${Date.now().toString(36)}`, service: 'fcm' })}
        >
          and rotates it
        </Action>
      </Row>
      <Readout>{() => `getDeviceToken() → ${token()}`}</Readout>
      <Show when={() => pushed().length > 0} fallback={() => <TextLine class="card-meta">no arrivals yet</TextLine>}>
        {() => <Readout>{() => pushed().slice(0, 4).join('\n')}</Readout>}
      </Show>
      <Prose>
        Read it once at startup and your backend has a token that is right until the day it is not: it rotates on
        reinstall, on restore from backup, and on the platform's own schedule. Every `onDeviceToken` arrival goes to the
        server, not just the first read — which is why the subscription exists at all.
      </Prose>
    </Panel>
  )
}

/** The badge, and the platform difference in what it even means. */
const Badge = (): LynxElement => {
  const count = signal<number>(0)
  const read = signal<string>('not read')

  const write = (next: number): void => {
    count(next)
    void setBadgeCount(next).then(() => void getBadgeCount().then((value) => read(String(value))))
  }

  return (
    <Panel
      title="setBadgeCount"
      blurb="Exact on iOS. On Android there is no badge API at all, so what comes back is what this app last set — a number the launcher may or may not be drawing."
    >
      <Row>
        <Action onTap={() => write(count() + 1)}>+1</Action>
        <Action onTap={() => write(0)}>clear</Action>
        <Action onTap={() => void getBadgeCount().then((value) => read(String(value)))}>getBadgeCount()</Action>
        <Chip>{() => `getBadgeCount() → ${read()}`}</Chip>
      </Row>
      <Prose>
        Clearing on launch is the usual reflex and it is usually wrong: the badge is the count of things the user has
        not dealt with, not of notifications they have not seen. Set it from your own unread count when the app
        foregrounds and it stays true across devices; clear it and it lies until the next push.
      </Prose>
    </Panel>
  )
}
