import { MODULE as DEEP_LINKING } from '@amritk/lynx-deep-linking'
import { createFakeDeepLinking, type FakeDeepLinking } from '@amritk/lynx-deep-linking/testing'
import { MODULE as DIALOGS } from '@amritk/lynx-dialogs'
import { createFakeDialogs, type FakeDialogs } from '@amritk/lynx-dialogs/testing'
import { MODULE as LOCATION } from '@amritk/lynx-location'
import { createFakeLocation, type FakeLocation } from '@amritk/lynx-location/testing'
import { MODULE as NOTIFICATIONS } from '@amritk/lynx-notifications'
import { createFakeNotifications, type FakeNotifications } from '@amritk/lynx-notifications/testing'
import { signal } from '@amritk/mini-lynx'
import { type ContextMessage, type ContextProxy, setPeerContext } from '@amritk/mini-lynx-native'
import { installNativeBridge } from '@amritk/mini-lynx-native/background'
import { createFakeContexts, createFakeEmitter, type FakeEmitter } from '@amritk/mini-lynx-native/testing'

/**
 * The device, for a browser that is not one.
 *
 * `dom-papi.ts` stands in for the *engine*; this stands in for everything on
 * the other side of the bridge — the second JavaScript context, the
 * `GlobalEventEmitter`, and the four native modules registered on it. Together
 * they are why a screen here can call `getCurrentPosition()` and get an answer
 * with no device and no simulator anywhere.
 *
 * The pieces are not this app's invention. Each package publishes the fake its
 * own suite runs against — `@amritk/lynx-location/testing` and the three
 * beside it — precisely so an app testing its own screens does not write a
 * second one, and this app is the first consumer to take them up on it. So the
 * code below is wiring and nothing else: no module is reimplemented here, and
 * the behaviour the screens demonstrate is the behaviour the packages' own
 * tests assert on.
 *
 * ## What it can and cannot show
 *
 * It reproduces the *contract*: method names, arities, call forms, the rules
 * the platforms enforce (a permission request after a refusal returns the
 * refusal, a second dialog is `busy`, an undeclared scheme is `noHandler`). It
 * reproduces none of the platform: no permission sheet is ever presented, no
 * radio is woken, and nothing is delayed by a real thread hop.
 *
 * The honest framing is the same one the preview engine takes. On a device
 * these calls cross a real boundary into Kotlin and Objective-C that
 * **nothing in this repository has ever run** — see each package's `AGENTS.md`.
 * What a screen here proves is that the JavaScript half is wired correctly, and
 * that is worth having on its own; it is not evidence that the native half
 * agrees.
 */

/** The fakes a screen drives to play the platform's part, plus the wire between them. */
export type FakeDevice = {
  readonly notifications: FakeNotifications
  readonly location: FakeLocation
  readonly dialogs: FakeDialogs
  readonly links: FakeDeepLinking
  /**
   * The `GlobalEventEmitter` the four modules publish through.
   *
   * Exposed because the `/native` screen demonstrates the wire itself rather
   * than any module on it, and "native published an event" is a thing only the
   * platform can do. A screen for a real module has no business touching this —
   * it drives that module's own fake instead.
   */
  readonly emitter: FakeEmitter
  /**
   * Every message that has crossed the bridge, oldest first.
   *
   * Reads {@link FakeDevice.revision} on the way past, so a binding on it is
   * live — this is the native half of what the `/engine` screen does with the
   * Element PAPI call log, and for the same reason: the wire is the thing being
   * explained, so it should be visible rather than described.
   */
  messages(): readonly ContextMessage[]
  /** Drops the transcript, leaving the wiring and the modules alone. */
  clearMessages(): void
  /**
   * Bumped once for every message in either direction.
   *
   * The fakes are plain objects with no reactivity — deliberately, since a
   * package that reached for signals would hand a consumer a second reactive
   * graph. This is the one line that bridges that gap for a *preview*: read it
   * and a getter over `dialogs.presented()` or `notifications.scheduled()`
   * re-runs when the wire moved.
   */
  revision(): number
}

/**
 * A module that exists only to be called badly.
 *
 * The four real modules are facades: they pick `callNative` or `callNativeAsync`
 * for you, so their screens cannot show what happens when that choice is wrong —
 * which is the bridge's single most reported failure. This one is registered
 * beside them with a method of each shape, so `/native` can make the wrong call
 * on purpose and let the result sit there.
 *
 * The name is deliberately not something a device would ever have: a host app
 * linking a module called `PlaygroundDemo` would be a surprise worth noticing.
 */
export const DEMO_MODULE = 'PlaygroundDemo'

/** The event the demo module publishes on, for the `onNativeEvent` panel. */
export const DEMO_EVENT = 'playground:tick'

/** The URL this preview pretends launched the process. See {@link install}. */
export const LAUNCH_URL = 'miniplayground://app/routing/amritk'

/** The scheme the host app would have declared in its manifest and its `Info.plist`. */
export const APP_SCHEME = 'miniplayground'

let installed: FakeDevice | null = null

/**
 * The device, installed on first use.
 *
 * Lazy and shared, because both halves of the bridge are process-wide: the
 * main-thread channel resolves one peer context and the background half serves
 * one registry. A second device would be a second `setPeerContext`, which is
 * not a second device at all — it is the first one being disconnected.
 *
 * `src/main.tsx` calls this at boot so the transcript starts there and the
 * cold-start seeds below are already in place; a test that mounts one screen in
 * isolation gets the same device from the same call.
 */
export const fakeDevice = (): FakeDevice => {
  installed ??= install()
  return installed
}

const install = (): FakeDevice => {
  // The count is kept beside the signal rather than read back out of it: the
  // bump happens inside message delivery, which can land in the middle of a
  // binding's own re-run, and a read there would enrol this counter as that
  // binding's dependency.
  let crossings = 0
  const revision = signal(0)
  const bump = (): void => revision(++crossings)

  const contexts = createFakeContexts()
  const emitter = createFakeEmitter()

  const notifications = createFakeNotifications(emitter)
  const location = createFakeLocation(emitter)
  const dialogs = createFakeDialogs()
  const links = createFakeDeepLinking(emitter)

  /**
   * Both proxies are wrapped rather than either fake, so the counter moves on
   * every call, every reply and every forwarded event — including the ones a
   * screen did not initiate, which is exactly the case a polled `presented()`
   * would miss.
   */
  const observe = (proxy: ContextProxy): ContextProxy => ({
    ...proxy,
    dispatchEvent: (event) => {
      const returned = proxy.dispatchEvent(event)
      bump()
      return returned
    },
  })

  // On a device these two lines are in different files, in different chunks,
  // running in different JavaScript contexts. Here they are three lines apart,
  // which is the one thing about this shim that is structurally unlike Lynx —
  // and the reason the `/native` screen spends a panel on the handshake rather
  // than letting the preview imply there is nothing to get wrong.
  setPeerContext(observe(contexts.mainThread))
  installNativeBridge({
    peer: observe(contexts.background),
    emitter,
    modules: {
      [NOTIFICATIONS]: notifications.module,
      [LOCATION]: location.module,
      [DIALOGS]: dialogs.module,
      [DEEP_LINKING]: links.module,
      [DEMO_MODULE]: demoModule,
    },
  })

  seed({ notifications, location, links })

  return {
    notifications,
    location,
    dialogs,
    links,
    emitter,
    messages: () => {
      revision()
      return contexts.messages()
    },
    clearMessages: () => {
      contexts.clear()
      bump()
    },
    revision,
  }
}

/**
 * The two call shapes and the two failures, as four methods.
 *
 * `returns` is what a native method that answers directly looks like — Lynx
 * calls it a synchronous method, and `callNative` is its spelling. `callsBack`
 * takes a trailing callback, which the bridge appends, and `callNativeAsync` is
 * that one. Nothing about the JavaScript tells you which a given native method
 * is; the header file does.
 */
const demoModule = {
  returns: (value: unknown) => ({ shape: 'returns', value }),
  callsBack: (value: unknown, done: (result: unknown) => void) => done({ shape: 'callsBack', value }),
  /** A native method that threw. The bridge turns it into a rejected promise. */
  throws: () => {
    throw new Error('the native method threw')
  },
  /**
   * A method that answers with a failure rather than throwing one — the
   * distinction the whole surface turns on, since this resolves.
   */
  refuses: (done: (result: unknown) => void) => done({ ok: false, error: 'notToday', message: 'the device said no' }),
} satisfies Record<string, unknown>

/**
 * The state the device came up in.
 *
 * A cold start is the one moment a preview cannot reach by pressing anything:
 * both `getInitialURL` and the held notification tap are answers to "what
 * happened before any of this code ran", and a device that booted plainly has
 * nothing to show for either. So the interesting boot is the one seeded here,
 * and the two screens that read it say that they were seeded.
 *
 * Permissions start `undetermined` on purpose, which is the state that makes
 * the request flow worth pressing — and the state an app is most likely to get
 * wrong, since asking is a one-shot.
 */
const seed = ({
  notifications,
  location,
  links,
}: {
  notifications: FakeNotifications
  location: FakeLocation
  links: FakeDeepLinking
}): void => {
  links.setInitialURL(LAUNCH_URL)
  links.setHandledSchemes(['https', 'http', 'mailto', 'tel', 'sms', APP_SCHEME])

  notifications.holdColdStartResponse({
    action: 'default',
    notification: {
      id: 'cold-start',
      title: 'Your build finished',
      body: 'Tapped while the app was not running.',
      data: { url: LAUNCH_URL },
      deliveredAt: Date.now(),
      remote: true,
    },
  })

  // A fix to hand out, so `getCurrentPosition` has something to succeed with
  // once permission is granted. `setLastKnownPosition` is left alone: a device
  // that has just booted has no cached fix, and the null branch is the one an
  // app forgets to write.
  location.setNextFix({
    latitude: 43.6532,
    longitude: -79.3832,
    accuracy: 12,
    altitude: 76,
    altitudeAccuracy: 8,
    speed: null,
    heading: null,
    timestamp: Date.now(),
  })
  location.setNextAddresses([
    {
      formattedAddress: '100 Queen St W, Toronto, ON M5H 2N2, Canada',
      name: 'Toronto City Hall',
      streetNumber: '100',
      street: 'Queen St W',
      district: null,
      city: 'Toronto',
      subregion: null,
      region: 'Ontario',
      postalCode: 'M5H 2N2',
      country: 'Canada',
      isoCountryCode: 'CA',
    },
  ])
}
