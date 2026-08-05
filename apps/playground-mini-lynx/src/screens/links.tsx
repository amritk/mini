import {
  canOpenURL,
  createURL,
  getInitialURL,
  isDeepLinkingAvailable,
  onDeepLink,
  openSettings,
  openURL,
  parseURL,
} from '@amritk/lynx-deep-linking'
import { type LynxElement, onCleanup, signal } from '@amritk/mini-lynx'
import { Show } from '@amritk/mini-lynx/flow'

import { Action, Chip, Panel, Prose, Readout, Row, Stack } from '../components'
import { APP_SCHEME, fakeDevice, LAUNCH_URL } from '../lib/fake-device'
import { nativeRoot } from '../lib/native-root'
import { router } from '../routes'

/**
 * `/links` — `@amritk/lynx-deep-linking`, URLs in and out.
 *
 * `Intent.ACTION_VIEW` and `onNewIntent` on Android; `UIApplication.open` and
 * the app-delegate URL callbacks on iOS. The two directions are not
 * symmetrical, and the asymmetry inbound is the part that decides where the
 * code goes:
 *
 * - A link that **launched** the app is a value — `getInitialURL()`.
 * - A link that arrives while it **runs** is an event — `onDeepLink()`.
 *
 * The launch URL is never published as an event, which is what lets an app use
 * both without handling one tap twice.
 *
 * ## What is seeded, and why it has to be
 *
 * This preview boots as though a link had launched it, because a cold start is
 * the one moment no button can produce: by the time there is a button, the
 * process is already running. So `LAUNCH_URL` in `src/lib/fake-device.ts` is
 * what the "system" handed this process, and the panel below is reading it back
 * through the real `getInitialURL`.
 */
export const LinksScreen = (): LynxElement => (
  <Stack gap="md">
    <Prose>
      The scheme is not linked by the package. `lynx.lib.json` links the native half; the intent filter, the bundle URL
      types, and one forwarded callback per platform are the host app's, and forgetting the callback gives an app that
      handles cold-start links and silently ignores every link after — which reads as a routing bug rather than as a
      wiring one.
    </Prose>
    <Inbound />
    <Parsing />
    <Minting />
    <Outbound />
  </Stack>
)

/** The two moments, and the subscription that is not on this screen. */
const Inbound = (): LynxElement => {
  const device = fakeDevice()
  const root = nativeRoot()
  const launch = signal<string>('not read')

  /**
   * A second subscription, made by this screen — so the fan-out is visible and
   * so the cleanup is somewhere you can see it. The root's is the one that
   * matters; this one exists to be unsubscribed when you navigate away.
   */
  const here = signal<readonly string[]>([])
  onCleanup(onDeepLink(({ url }) => here([url, ...here()])))

  return (
    <Panel
      title="A launch URL is a value; everything after it is an event"
      blurb="Both are captured at the app root during first render, because a link that arrived with no view up is held natively and replayed once — to whoever subscribes first."
    >
      <Row>
        <Action onTap={() => void getInitialURL().then((url) => launch(url ?? 'null'))}>getInitialURL()</Action>
        <Action onTap={() => device.links.deliver(`${APP_SCHEME}://app/text`)}>deliver a link now</Action>
        <Action onTap={() => device.links.hold(`${APP_SCHEME}://app/list`)}>hold one, as a cold start would</Action>
      </Row>

      <Readout>{() => `getInitialURL()      → ${launch()}`}</Readout>
      <Readout>{() => `the root captured    → ${root.launchURL() ?? 'nothing yet'}`}</Readout>
      <Readout>
        {() => `links since launch   → ${root.links().length === 0 ? 'none' : root.links().slice(0, 4).join(', ')}`}
      </Readout>
      <Readout>
        {() => `this screen also saw → ${here().length === 0 ? 'none' : here().slice(0, 4).join(', ')}`}
      </Readout>

      <Prose>
        The launch URL never appears in either list of events, however many times you read it: it is a value for the
        life of the process, which is also why re-reading it on every mount makes a screen re-navigate every time it is
        shown. Read it once, at the root.
      </Prose>
      <Prose>
        A held link is different — it is flushed by the next subscription and delivered exactly once, which is why
        pressing “hold one” shows nothing until something subscribes. Subscribing on the screen the link points at
        cannot work: that screen does not exist yet, and by the time it does the link is gone.
      </Prose>
    </Panel>
  )
}

/** The URL grammar, which is where the single most common deep-linking bug lives. */
const Parsing = (): LynxElement => {
  const url = signal<string>(LAUNCH_URL)
  const parsed = (): string => JSON.stringify(parseURL(url()), null, 1)

  const routeIt = (): void => {
    const { path } = parseURL(url())
    router.navigate(path === '' ? '/' : path)
  }

  return (
    <Panel
      title="parseURL — route on host, not on path alone"
      blurb="Pure, synchronous, no bridge: it is string arithmetic, so it is the one function here that does not return a promise."
    >
      <Row gap="xs">
        <Action onTap={() => url(LAUNCH_URL)}>the launch URL</Action>
        <Action onTap={() => url(`${APP_SCHEME}://profile/42`)}>profile/42</Action>
        <Action onTap={() => url(`${APP_SCHEME}://app/routing/amritk?tab=builds#top`)}>with a query</Action>
        <Action onTap={() => url('https://example.com/a%2Fb')}>percent-encoded</Action>
      </Row>
      <Readout>{url}</Readout>
      <Readout>{parsed}</Readout>
      <Row>
        <Action onTap={routeIt}>navigate to its path</Action>
      </Row>

      <Prose>
        Press “profile/42”: the host is `profile` and the path is `/42`. That is the URL grammar rather than this
        parser, and routing on the path alone is the bug it produces — so either route on the host too, or mint links
        with a dummy authority the way the launch URL does, where `app` is the host and the whole route is the path.
      </Prose>
      <Prose>
        `path` is still percent-encoded and `query` is decoded. That split is deliberate: a path is decoded per segment
        or not at all, because an encoded slash inside one segment is not a separator — decoding the whole string first
        turns it into one. `matchRoute` from `@amritk/mini-helpers`, which this app's router already uses, decodes at
        the level that is safe.
      </Prose>
    </Panel>
  )
}

/** Minting links, and the encoding that hand-built strings skip. */
const Minting = (): LynxElement => {
  const built = signal<string>(
    createURL(APP_SCHEME, '/routing/amritk', { host: 'app', query: { tab: 'builds' }, fragment: 'top' }),
  )

  return (
    <Panel
      title="createURL"
      blurb="Also pure. It encodes what you give it, which is the whole reason to prefer it over a template literal."
    >
      <Row gap="xs">
        <Action
          onTap={() =>
            built(createURL(APP_SCHEME, '/routing/amritk', { host: 'app', query: { tab: 'builds' }, fragment: 'top' }))
          }
        >
          a route
        </Action>
        <Action
          onTap={() =>
            built(createURL(APP_SCHEME, '/callback', { host: 'auth', query: { state: 'a&b c/d', code: '£1' } }))
          }
        >
          an OAuth callback
        </Action>
      </Row>
      <Readout>{built}</Readout>
      <Prose>
        The second one is the case that ends in a support ticket: an unencoded ampersand in a state token loses half the
        link, and the half that survives still parses, so nothing fails until the token does not match on the way back.
      </Prose>
    </Panel>
  )
}

/** Out: what this app can open, and what the host app forgot to declare. */
const Outbound = (): LynxElement => {
  const device = fakeDevice()
  const result = signal<string>('not asked')
  const can = signal<string>('not asked')
  const linked = signal<boolean | null>(null)

  // The fake is a plain object, so these two read the preview's revision signal
  // first — it is bumped by every message that crosses the bridge, which
  // includes the calls these are counting.
  const opened = (): readonly string[] => {
    device.revision()
    return device.links.opened()
  }
  const settingsOpened = (): number => {
    device.revision()
    return device.links.settingsOpened()
  }

  const open = (url: string): void => {
    void openURL(url).then((outcome) =>
      result(outcome.ok ? `${url} → opened` : `${url} → ${outcome.error}: ${outcome.message}`),
    )
  }

  const probe = (url: string): void => {
    void canOpenURL(url).then((answer) => can(`canOpenURL(${url}) → ${answer}`))
  }

  return (
    <Panel
      title="openURL, canOpenURL, openSettings"
      blurb="Results are unions here too. “Nothing opens that” is a resolved failure; a rejection would mean the module is not linked at all."
    >
      <Row gap="xs">
        <Action onTap={() => open('https://lynxjs.org')}>an https URL</Action>
        <Action onTap={() => open('mailto:hello@example.com')}>a mailto</Action>
        <Action onTap={() => open('whatsapp://send?phone=15550100')}>an undeclared scheme</Action>
        <Action onTap={() => open('not a url')}>not a URL at all</Action>
      </Row>
      <Row gap="xs">
        <Action onTap={() => probe('whatsapp://send')}>canOpenURL(whatsapp)</Action>
        <Action onTap={() => probe(`${APP_SCHEME}://app`)}>canOpenURL(this app)</Action>
        <Action onTap={() => void openSettings()}>openSettings()</Action>
        <Action onTap={() => void isDeepLinkingAvailable().then(linked)}>isDeepLinkingAvailable()</Action>
      </Row>

      <Readout>{() => `openURL   → ${result()}`}</Readout>
      <Readout>{can}</Readout>
      <Row>
        <Chip tone={() => (linked() === true ? 'good' : 'neutral')}>
          {() => `linked: ${linked() === null ? '—' : linked()}`}
        </Chip>
        <Chip>{() => `opened: ${opened().length} · settings opened: ${settingsOpened()}`}</Chip>
      </Row>

      <Show when={() => opened().length > 0}>{() => <Readout>{() => opened().slice(-5).join('\n')}</Readout>}</Show>

      <Prose>
        `noHandler` does not mean the other app is missing. It usually means this host app never declared that it wanted
        to see the scheme — `queries` on Android 11 and later, `LSApplicationQueriesSchemes` on iOS — so the answer is a
        manifest change rather than a fallback. Which does not make the fallback optional: showing the phone number when
        WhatsApp will not open is the difference between a dead button and a working screen.
      </Prose>
      <Prose>
        `openSettings` opens this app's own page, which is the destination for every `denied` on the two screens before
        this one. It is the only recovery an app has once a permission prompt has been spent.
      </Prose>
    </Panel>
  )
}
