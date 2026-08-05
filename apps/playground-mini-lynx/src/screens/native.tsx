import { type LynxElement, onCleanup, signal } from '@amritk/mini-lynx'
import { For, Show } from '@amritk/mini-lynx/flow'
import { callNative, callNativeAsync, isNativeModuleAvailable, onNativeEvent } from '@amritk/mini-lynx-native'

import { Action, Chip, Panel, Prose, Readout, Row, Stack, TextLine } from '../components'
import { DEMO_EVENT, DEMO_MODULE, fakeDevice } from '../lib/fake-device'

/**
 * `/native` — `@amritk/mini-lynx-native`, the wire under the other four
 * screens.
 *
 * Lynx runs an app in two JavaScript contexts and puts `NativeModules` in only
 * one of them — the background one — while the Element PAPI, and therefore this
 * runtime, lives in the other. A component reaching for `NativeModules` gets
 * `undefined`: not an error, just an absent property, which is why the first
 * hour with it is usually spent looking for a typo.
 *
 * This package is the carrier. It invents no capability and wraps no module;
 * everything on the next four screens is built on the two functions and one
 * subscription demonstrated here.
 *
 * ## What the preview is standing in for
 *
 * `src/lib/fake-device.ts` installs both halves in this one browser context,
 * over the fake contexts the package publishes for its own suite. So the
 * *messages* below are real — the protocol, the correlation by id, the
 * handshake, the fan-out are the shipping code — and the thread is not: a
 * reply arrives on a microtask rather than after a real hop, and nothing here
 * can tell you what the engine does under contention.
 */
export const NativeScreen = (): LynxElement => (
  <Stack gap="md">
    <Prose>
      Everything on this screen resolves against fakes registered by the preview, including a `PlaygroundDemo` module
      that exists so the two call shapes can be got wrong on purpose. No Kotlin and no Objective-C is involved, here or
      anywhere else in this repository — see each package's README for what that leaves unverified.
    </Prose>
    <Setup />
    <CallShapes />
    <Failures />
    <Availability />
    <Events />
    <Transcript />
    <Teardown />
  </Stack>
)

/** The two lines, and the one that is always the missing one. */
const Setup = (): LynxElement => (
  <Panel
    title="Two lines, in two chunks"
    blurb="Both are required, and only one of them is where you are looking when it does not work."
  >
    <Readout>
      {[
        '// background chunk — once, at startup',
        "import { installNativeBridge } from '@amritk/mini-lynx-native/background'",
        'installNativeBridge()',
        '',
        '// main-thread chunk — anywhere',
        "import { callNative } from '@amritk/mini-lynx-native'",
        "const level = await callNative<number>('BatteryModule', 'level')",
      ].join('\n')}
    </Readout>
    <Prose>
      Write only the second and every call queues forever with nothing said about why — the message is dispatched into a
      context where nothing is listening, which is not an error on either side. The channel says hello when it attaches
      and holds calls until it hears back, so the two chunks may come up in either order; what it cannot do is invent a
      peer that never installed.
    </Prose>
  </Panel>
)

/** What became of one call. */
type AttemptState = 'pending' | 'resolved' | 'rejected'

/**
 * A call the platform answered, or is still thinking about.
 *
 * `state` and `detail` are signals rather than fields, because a row here is
 * built once from the item it was handed and is never rebuilt for a new one —
 * that is `For`'s whole contract. Replacing the entry in the array would leave
 * the row showing the values it was born with, which for this log means every
 * call looking permanently pending. The mutable part has to be inside the item.
 */
type Attempt = {
  readonly id: number
  readonly label: string
  readonly state: () => AttemptState
  readonly detail: () => string
}

/** A log of attempts and the one function that appends to it. */
type Attempts = {
  attempts: () => readonly Attempt[]
  run: (label: string, call: () => Promise<unknown>) => void
}

/** A log of attempts, newest first, each settling in place when its promise does. */
const createAttempts = (): Attempts => {
  const attempts = signal<readonly Attempt[]>([])
  let nextId = 1

  const run = (label: string, call: () => Promise<unknown>): void => {
    const state = signal<AttemptState>('pending')
    const detail = signal('waiting…')
    attempts([{ id: nextId++, label, state, detail }, ...attempts()])

    const settle = (next: AttemptState, text: string): void => {
      state(next)
      detail(text)
    }

    void call().then(
      (value) => settle('resolved', show(value)),
      (error: unknown) => settle('rejected', error instanceof Error ? error.message : String(error)),
    )
  }

  return { attempts, run }
}

/** A resolved value as something readable. `undefined` does not survive `JSON.stringify`. */
const show = (value: unknown): string => (value === undefined ? 'undefined' : JSON.stringify(value))

type AttemptListProps = {
  attempts: () => readonly Attempt[]
}

/** The log itself. A row that never leaves `pending` is the point of two of the buttons above it. */
const AttemptList = (props: AttemptListProps): LynxElement => (
  <Stack gap="xs">
    <Show when={() => props.attempts().length === 0}>
      {() => <TextLine class="card-meta">nothing called yet</TextLine>}
    </Show>
    <For each={props.attempts} key={(entry) => String(entry.id)}>
      {(entry) => (
        <Row gap="xs">
          <Chip tone={() => (entry.state() === 'resolved' ? 'good' : entry.state() === 'rejected' ? 'bad' : 'neutral')}>
            {entry.state}
          </Chip>
          <Readout>{() => `${entry.label} → ${entry.detail()}`}</Readout>
        </Row>
      )}
    </For>
  </Stack>
)

/**
 * The choice that is about the native method, not the JavaScript one.
 *
 * Both spellings return a promise, which is exactly why this gets picked
 * wrongly: nothing at the call site looks different, and the symptom arrives
 * later and in a different file.
 */
const CallShapes = (): LynxElement => {
  const { attempts, run } = createAttempts()

  return (
    <Panel
      title="callNative or callNativeAsync"
      blurb="callNative is for a native method that RETURNS its result; callNativeAsync is for one that takes a trailing callback. Both hand you a promise, so the wrong choice compiles and passes review."
    >
      <Row>
        <Action onTap={() => run("callNative('returns')", () => callNative(DEMO_MODULE, 'returns', 'hi'))}>
          callNative → returns
        </Action>
        <Action
          onTap={() => run("callNativeAsync('callsBack')", () => callNativeAsync(DEMO_MODULE, 'callsBack', 'hi'))}
        >
          callNativeAsync → callsBack
        </Action>
      </Row>
      <Row>
        <Action onTap={() => run("callNative('callsBack')", () => callNative(DEMO_MODULE, 'callsBack', 'hi'))}>
          callNative on a callback method
        </Action>
        <Action onTap={() => run("callNativeAsync('returns')", () => callNativeAsync(DEMO_MODULE, 'returns', 'hi'))}>
          callNativeAsync on a returning one
        </Action>
      </Row>

      <AttemptList attempts={attempts} />

      <Prose>
        The two wrong calls fail differently, and it is worth knowing which is which. `callNative` on a callback method
        invokes it with no callback and replies with whatever it returned — so it *settles*: with `undefined` for a
        native method that stores the callback for later, or as a rejection when the method reaches for the argument
        that is not there, which is what the demo module does and what the row above shows.
      </Prose>
      <Prose>
        `callNativeAsync` on a returning method is the quiet one. The bridge appends a callback, the method ignores the
        extra argument and returns as usual, nothing ever invokes what was appended, and the promise stays pending for
        the life of the process — the row above is still on `pending` and always will be. Nothing can detect it: a
        native method that has not called back yet and one that never will are the same observation.
      </Prose>
      <Prose>
        Which is why the four module packages wrap this rather than leaving it to each app. The header file is the only
        source of truth for a method's shape, and it is not in the same language, the same file, or usually the same
        repository as the call site.
      </Prose>
    </Panel>
  )
}

/** Rejected, resolved-with-a-failure, and the difference that matters at every call site. */
const Failures = (): LynxElement => {
  const { attempts, run } = createAttempts()

  return (
    <Panel
      title="A rejection means the call could not be MADE"
      blurb="Module not linked, method not on it, native threw. Anything the native side chose to answer — including a failure — is a RESOLVED promise, and reading it is your job."
    >
      <Row>
        <Action onTap={() => run("callNative('throws')", () => callNative(DEMO_MODULE, 'throws'))}>native threw</Action>
        <Action onTap={() => run("callNative('missing')", () => callNative(DEMO_MODULE, 'missing'))}>
          no such method
        </Action>
        <Action onTap={() => run("callNative('NotLinked')", () => callNative('NotLinked', 'anything'))}>
          module not linked
        </Action>
        <Action onTap={() => run("callNativeAsync('refuses')", () => callNativeAsync(DEMO_MODULE, 'refuses'))}>
          answered with a failure
        </Action>
      </Row>

      <AttemptList attempts={attempts} />

      <Prose>
        The last one is the shape every module package on the next four screens uses — an `ok: false` with an `error`
        and a `message`, as a value rather than as a throw. Wrapping these calls in `try`/`catch` and expecting to catch
        a denied permission is the mistake that follows from not separating them — the `catch` never runs, and the `ok:
        false` falls through to code that reads a field that is not there.
      </Prose>
      <Prose>
        The two rejections are also worth telling apart in the message: "not linked" is a build problem in the host app
        and "no such method" is a version problem — an app running against an older native half — and they are fixed in
        different places by different people.
      </Prose>
    </Panel>
  )
}

/** Feature detection, which is what lets a bundle run in a host that linked less than it wanted. */
const Availability = (): LynxElement => {
  const checked = signal<readonly string[]>([])

  const check = (): void => {
    const probes: readonly (readonly [string, Promise<boolean>])[] = [
      [`${DEMO_MODULE} (whole module)`, isNativeModuleAvailable(DEMO_MODULE)],
      [`${DEMO_MODULE}.returns`, isNativeModuleAvailable(DEMO_MODULE, 'returns')],
      [`${DEMO_MODULE}.missing`, isNativeModuleAvailable(DEMO_MODULE, 'missing')],
      ['NotLinked', isNativeModuleAvailable('NotLinked')],
    ]

    void Promise.all(probes.map(async ([label, probe]) => `${label}: ${await probe}`)).then(checked)
  }

  return (
    <Panel
      title="isNativeModuleAvailable"
      blurb="One bundle can run inside a host that linked a module and one that did not. This is how a screen hides a control rather than failing when it is pressed."
    >
      <Action onTap={check}>probe four things</Action>
      <Show when={() => checked().length > 0} fallback={() => <TextLine class="card-meta">not probed yet</TextLine>}>
        {() => <Readout>{() => checked().join('\n')}</Readout>}
      </Show>
      <Prose>
        Probing a method rather than the module is the version-proof form: a host that linked last year's native half
        has the module and not the method, and the answer an app wants is about the capability rather than the
        dependency. Each of the four module packages exports this pre-bound — `isLocationAvailable`,
        `areDialogsAvailable` — so a screen does not repeat the module name.
      </Prose>
    </Panel>
  )
}

/**
 * The other direction: something native decided to publish.
 *
 * The counter is here to make the fan-out rule visible. However many
 * main-thread subscribers a name has, the background half holds exactly one
 * emitter listener for it and drops that one when the last subscriber leaves —
 * which is invisible in behaviour and looks exactly like working code until an
 * app has been navigating for a while.
 */
const Events = (): LynxElement => {
  const device = fakeDevice()
  const received = signal<readonly string[]>([])
  const subscribed = signal(false)

  let stop: (() => void) | null = null

  const toggle = (): void => {
    if (stop) {
      stop()
      stop = null
      subscribed(false)
      return
    }
    stop = onNativeEvent(DEMO_EVENT, (...args) => received([`${DEMO_EVENT} ${show(args[0])}`, ...received()]))
    subscribed(true)
  }

  // The emitter is a plain object with no reactivity of its own, so the count is
  // read behind `subscribed()` — which changes in the same breath, and is what
  // makes this line live.
  const listeners = (): string =>
    `${subscribed() ? 'subscribed' : 'not subscribed'} · emitter listeners: ${device.emitter.listenerCount(DEMO_EVENT)}`

  // The unsubscribe is not optional, and a screen is exactly where it gets
  // forgotten: this component is rebuilt on every visit to this tab, and a
  // listener that outlives it is a leak that grows one entry per navigation.
  onCleanup(() => stop?.())

  return (
    <Panel
      title="onNativeEvent"
      blurb="A native method answers once. A stream of anything — a location fix, a notification, a link — is published through the emitter instead, and arrives here."
    >
      <Row>
        <Action onTap={toggle}>{() => (subscribed() ? 'unsubscribe' : 'subscribe')}</Action>
        <Action onTap={() => device.emitter.emit(DEMO_EVENT, { at: Date.now() })}>publish from “native”</Action>
        <Chip tone={() => (subscribed() ? 'good' : 'neutral')}>{listeners}</Chip>
      </Row>
      <Show when={() => received().length > 0} fallback={() => <TextLine class="card-meta">nothing received</TextLine>}>
        {() => <Readout>{() => received().slice(0, 6).join('\n')}</Readout>}
      </Show>
      <Prose>
        Publish while unsubscribed and nothing arrives — not because the event was dropped on this side, but because the
        background half is not listening for it at all. The listener count above is the emitter's own, and it goes to
        one on the first subscriber and back to zero on the last, whatever happens in between.
      </Prose>
      <Prose>
        Arguments are `unknown`, because `sendGlobalEvent`'s are. Narrow once at the edge — which is what every module
        package here does, so a screen for one of them never sees an `unknown` at all.
      </Prose>
    </Panel>
  )
}

/** The wire itself, printed. The native counterpart of the `/engine` screen's call log. */
const Transcript = (): LynxElement => {
  const device = fakeDevice()

  const lines = (): readonly string[] =>
    device
      .messages()
      .slice(-14)
      .map((message) => `${message.type.padEnd(9)} ${message.data === undefined ? '' : JSON.stringify(message.data)}`)

  return (
    <Panel
      title="Everything that crossed"
      blurb="The last fourteen messages, oldest first — the protocol in full, since there is nothing else in it."
    >
      <Row>
        <Action onTap={() => device.clearMessages()}>clear</Action>
        <Chip>{() => `messages: ${device.messages().length}`}</Chip>
      </Row>
      <Readout>{() => lines().join('\n')}</Readout>
      <Prose>
        `hello` and `ready` are the handshake, and it runs in whichever order the two chunks came up. `call` carries an
        id the reply comes back under, which is the whole of the correlation — there is no session, no ordering
        guarantee and no retry. `listen` goes over once per event name rather than once per subscriber, and `unlisten`
        when the last one leaves.
      </Prose>
      <Prose>
        Note what is *not* here: nothing that is not JSON. No functions, no class instances, no `Date` — a date arrives
        on the other side as an empty object rather than as an error, which is why every timestamp on the next four
        screens is a number.
      </Prose>
    </Panel>
  )
}

/** The teardown, described rather than offered — with the reason it is not offered. */
const Teardown = (): LynxElement => (
  <Panel
    title="resetNativeChannel, and why there is no button for it"
    blurb="It detaches the channel, rejects every call still in flight, and forgets every subscription."
  >
    <Readout>
      {[
        "import { resetNativeChannel } from '@amritk/mini-lynx-native'",
        '',
        '// a test, between cases — or a page being torn down without ending the process',
        'resetNativeChannel()',
      ].join('\n')}
    </Readout>
    <Prose>
      Pressing it here would settle the stuck row further up this screen, which is the useful half. It would also drop
      the two subscriptions this app makes at its root — the deep link handler and the notification tap handler — and
      those are never re-made, because the root renders once. The `/links` and `/notifications` screens would go quiet
      for the rest of the session with nothing to say why.
    </Prose>
    <Prose>
      That is the shape of the hazard rather than an accident of this playground: the reset is process-wide, and the
      subscriptions most worth keeping are the ones made furthest from wherever you are calling it. A test wants it
      between cases; an app wants it when a page goes away and not otherwise.
    </Prose>
  </Panel>
)
