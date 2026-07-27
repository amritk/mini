import { type Dispose, type HostElement, mount, onCleanup, requireHost, setHost, signal } from '@amritk/mini-native'
import { For } from '@amritk/mini-native/flow'
import { createLynxHost, lynxRoot } from '@amritk/mini-native/hosts/lynx'
import { Row, Stack, Text } from '@amritk/mini-native/ui'

import { createFakeLynxEngine, type FakeLynxElement, type FakeLynxEngine } from '../lib/fake-lynx'
import { serializeLynxTree } from '../lib/serialize-lynx-tree'
import { Action, Chip, Panel, Readout } from '../lib/ui'
import { PaletteContext } from '../theme'

/**
 * `@amritk/mini-native/hosts/lynx` — the native target, driven live in a
 * browser.
 *
 * Lynx is the target this runtime was shaped for. Its element tree is MUTABLE
 * and imperative — create a node, set an attribute, append a child — which is
 * exactly what a runtime with no virtual tree needs, and the Element PAPI exists
 * so that frameworks other than React can drive the engine. So this adapter is
 * using it as intended rather than working around anything.
 *
 * Everything on this screen runs the REAL host. What is fake is the engine
 * underneath it: a plain object implementing the PAPI, which the host accepts
 * because it takes the PAPI as an argument rather than reading the engine
 * globals. That one decision is what makes a device target inspectable from a
 * browser tab, and it is why the mapping below is evidence rather than a
 * diagram.
 */
export const LynxScreen = (): HostElement => (
  <Stack gap="md">
    <Text tone="muted" size="sm">
      The DOM host around this screen is the preview; the panels below are the device. Same components, same runtime,
      different fifteen functions underneath — which is the claim the whole package rests on, and the only honest way to
      show it in a browser is to run both at once.
    </Text>
    <TreeMapping />
    <CallLog />
    <Events />
    <Flushing />
    <BeyondThePapi />
  </Stack>
)

/**
 * Renders a component through the Lynx host against a fresh fake engine.
 *
 * Which host is installed is normally a boot-time decision, and swapping it at
 * runtime is legitimate here for the same narrow reasons `/composition` gives:
 * the swap is synchronous, so nothing else can render in between, and the DOM
 * host INSTANCE is put back rather than a fresh one — a new instance would not
 * carry the per-element bookkeeping the live tree already depends on.
 *
 * The bindings inside the built subtree capture the host they were built under,
 * so the returned tree goes on being driven by the Lynx host afterwards. That is
 * what makes the panels below live rather than a snapshot: a button in the
 * browser preview writes a signal, and the mutation lands on the fake engine.
 */
const renderThroughLynx = (component: () => HostElement): { engine: FakeLynxEngine; dispose: Dispose } => {
  const engine = createFakeLynxEngine()
  const previous = requireHost()
  setHost(createLynxHost(engine.api))
  try {
    const dispose = mount(lynxRoot(engine.rootElement), component)
    return { engine, dispose }
  } finally {
    setHost(previous)
  }
}

/** The vocabulary, as Lynx elements and Lynx attribute names. */
const TreeMapping = (): HostElement => {
  const label = signal('Ada Lovelace')
  const tree = signal('')

  const Card = (): HostElement => (
    <view role="button" label="Open the profile" testId="profile-card" style={{ padding: 12, gap: 4 }}>
      <text style={{ fontSize: 16, lineHeight: 22 }}>{label}</text>
      <text style={{ fontSize: 13 }} lines={1}>
        first programmer
      </text>
    </view>
  )

  const { engine, dispose } = renderThroughLynx(Card)
  onCleanup(dispose)

  const refresh = (): void => tree(serializeLynxTree(engine.root))
  refresh()

  return (
    <Panel
      title="The tree a device would show"
      blurb="Three mappings do most of the work: a text run lives in a raw-text child carrying a `text` attribute, the accessibility props take the engine's own attribute names, and every bare number in a style bag has picked up its unit on the way through."
    >
      <Readout>{tree}</Readout>
      <Row gap="sm">
        <Action
          onTap={() => {
            label(label() === 'Ada Lovelace' ? 'Grace Hopper' : 'Ada Lovelace')
            refresh()
          }}
        >
          rename
        </Action>
        <Action onTap={refresh}>re-read the tree</Action>
      </Row>
      <Text size="sm" tone="muted">
        Renaming writes one signal. The binding was built under the Lynx host and still holds it, so the write lands on
        the fake engine as a single `__SetAttribute` on the `raw-text` node — no diff, no rebuild, and nothing else in
        the tree touched.
      </Text>
      <Text size="sm" tone="muted">
        `testId` becomes `data-testid`, the same spelling the DOM host emits, so one selector finds the element in the
        browser preview and on the device alike. That is the sort of detail that is free to align now and expensive to
        align after a test suite exists.
      </Text>
    </Panel>
  )
}

/** The PAPI calls themselves — the porting cost, made countable. */
const CallLog = (): HostElement => {
  const palette = PaletteContext.use()
  const lines = signal<readonly string[]>([])
  const rows = signal<readonly string[]>(['alpha', 'beta'])

  const List = (): HostElement => (
    <For each={rows} as="view" role="list" label="Rows" style={{ gap: 4 }}>
      {(row) => (
        <view role="listitem">
          <text>{row}</text>
        </view>
      )}
    </For>
  )

  const { engine, dispose } = renderThroughLynx(List)
  onCleanup(dispose)

  const capture = (): void => lines(engine.log().slice(-14))
  engine.clearLog()

  return (
    <Panel
      title="Every call the runtime makes"
      blurb="Reordering the rows below is the reconciler at work — the only one in the package. Watch what it costs: a moved row is one __RemoveElement and one __InsertElementBefore, because insert doubles as a move and nothing is rebuilt."
    >
      <Row gap="sm">
        <Action
          onTap={() => {
            engine.clearLog()
            rows([...rows()].reverse())
            capture()
          }}
        >
          reverse the rows
        </Action>
        <Action
          onTap={() => {
            engine.clearLog()
            rows([...rows(), `row ${rows().length + 1}`])
            capture()
          }}
        >
          append a row
        </Action>
        <Action
          onTap={() => {
            engine.clearLog()
            rows(rows().slice(1))
            capture()
          }}
        >
          drop the first
        </Action>
      </Row>
      <Readout>
        {() => (lines().length === 0 ? '(press a button — the log is cleared before each action)' : lines().join('\n'))}
      </Readout>
      <text style={() => ({ color: palette().muted, fontSize: 13, lineHeight: 19 })}>
        The flow wrapper is created with `accessibility-element` set to false, which is the invariant `createFlowHost`
        carries: nobody wrote that element, so it must not appear between a `role="list"` and its items. On the web the
        equivalent wrapper is `display: contents`; here it is an ordinary container view that has been told to keep out
        of the accessibility tree.
      </text>
    </Panel>
  )
}

/** Engine events in, vocabulary events out. */
const Events = (): HostElement => {
  const received = signal<readonly string[]>([])
  const note = (line: string): void => received([line, ...received()].slice(0, 6))

  const Surface = (): HostElement => (
    <view
      role="button"
      onTap={(event) => note(`onTap        → ${JSON.stringify({ x: event.x, y: event.y })}`)}
      onPointer={(event) => note(`onPointer    → ${JSON.stringify({ phase: event.phase, x: event.x, y: event.y })}`)}
    >
      <text>target</text>
    </view>
  )

  const { engine, dispose } = renderThroughLynx(Surface)
  onCleanup(dispose)

  /** The element the handlers were attached to — the first child of the page. */
  const target = (): FakeLynxElement => engine.root.children[0] as FakeLynxElement

  return (
    <Panel
      title="Events, normalised"
      blurb="The engine reports a gesture's position under `detail` and a scroll offset as scrollLeft/scrollTop — different words for the same numbers the DOM host reads off a MouseEvent. Reconciling that in the host is the entire reason onScroll={(event) => event.y} means one thing on both targets."
    >
      <Row gap="sm">
        <Action onTap={() => engine.dispatch(target(), 'tap', { detail: { x: 24, y: 91 } })}>engine: tap</Action>
        <Action onTap={() => engine.dispatch(target(), 'touchstart', { detail: { identifier: 1, x: 10, y: 10 } })}>
          engine: touchstart
        </Action>
        <Action onTap={() => engine.dispatch(target(), 'touchend', { detail: { identifier: 1, x: 48, y: 12 } })}>
          engine: touchend
        </Action>
      </Row>
      <Readout>{() => (received().length === 0 ? '(dispatch an engine event above)' : received().join('\n'))}</Readout>
      <Text size="sm" tone="muted">
        One `onPointer` prop becomes four engine listeners — touchstart, touchmove, touchend, touchcancel — because a
        gesture is a sequence and splitting it across four props would mean reassembling it at every call site. The
        recognisers in `/gestures` are pure arithmetic over exactly this stream, which is why they are portable by
        construction rather than by effort.
      </Text>
      <Text size="sm" tone="muted">
        Lynx keeps only ONE listener per event name, so registering a second would silently drop the first. The host
        registers a single dispatcher per name and fans out to its own handler set, which restores the add-many
        semantics every other host provides — and drops the dispatcher again once nothing is listening.
      </Text>
    </Panel>
  )
}

/** Why `flush` is on the contract at all. */
const Flushing = (): HostElement => {
  const count = signal(0)
  const flushes = signal(0)
  const pending = signal(0)

  const Counter = (): HostElement => (
    <view>
      <text>{() => `count: ${count()}`}</text>
    </view>
  )

  const { engine, dispose } = renderThroughLynx(Counter)
  onCleanup(dispose)
  flushes(engine.flushes())

  const mutate = (times: number): void => {
    for (let index = 0; index < times; index += 1) count(count() + 1)
    pending(pending() + times)
  }

  const commit = (): void => {
    // On a device the runtime does this for you, once per tick, from
    // `scheduleFlush`. It is by hand here because the host that ends this tick
    // is the DOM one — the flush is read late, so whoever is installed at the
    // end of the tick is who commits, and that is the DOM host in this app.
    engine.api.__FlushElementTree()
    flushes(engine.flushes())
    pending(0)
  }

  return (
    <Panel
      title="flush"
      blurb="Nothing reaches the screen on Lynx until the tree is committed, so this host defines flush and lets the scheduler coalesce a whole tick of mutations into one commit. That is the difference between a cheap update and a whole-tree commit per signal write."
    >
      <Row gap="sm">
        <Action onTap={() => mutate(1)}>mutate ×1</Action>
        <Action onTap={() => mutate(25)}>mutate ×25</Action>
        <Action onTap={commit}>commit</Action>
      </Row>
      <Readout>
        {() =>
          [
            `attribute writes since the last commit: ${pending()}`,
            `__FlushElementTree calls so far:        ${flushes()}`,
          ].join('\n')
        }
      </Readout>
      <Chip tone={() => (pending() === 0 ? 'good' : 'neutral')}>
        {() => (pending() === 0 ? 'committed' : `${pending()} mutation(s) pending`)}
      </Chip>
      <Text size="sm" tone="muted">
        Twenty-five writes, one commit. The flag is cleared by the pending microtask rather than by whoever installed a
        host, so a swap mid-tick still rides the commit that was already scheduled instead of quietly suppressing it.
      </Text>
    </Panel>
  )
}

/** The honest edges: what the adapter cannot reach, and what it asks for instead. */
const BeyondThePapi = (): HostElement => (
  <Panel
    title="What the PAPI does not cover"
    blurb="Colour scheme, viewport, safe-area insets, moving focus and the engine's own animation API all live outside the Element PAPI — on system-information globals and UI-method calls that vary by engine version and cannot be exercised against a fake. So they are passed IN rather than guessed at."
  >
    <Readout>
      {[
        'setHost(createLynxHost(undefined, {',
        '  environment: { colorScheme, dimensions, safeArea, reduceMotion },  // signals from your engine',
        '  focus: (element) => yourEngineFocus(element),',
        '  blur:  (element) => yourEngineBlur(element),',
        '  animate: yourEngineAnimator,   // an UPGRADE — see below',
        '}))',
      ].join('\n')}
    </Readout>
    <Text size="sm" tone="muted">
      Omit them and the accessors report their documented static values and `focus` is a no-op — a smaller promise, but
      one that is true on every build. Guessing at global names would mean shipping a host that behaves plausibly on
      some engine versions and silently wrongly on others, which is worse than asking the app, which knows exactly which
      engine it is running on.
    </Text>
    <Text size="sm" tone="muted">
      `animate` is the one option that is an upgrade rather than a gap. The default expresses a timeline as inline
      transitions — the most the declared contract can express — so the engine genuinely owns the interpolation, but the
      sequencing between keyframes is a JavaScript timer. An engine build with a real animation API should be handed
      here, where it will be frame-exact.
    </Text>
    <Text size="sm" tone="muted">
      The attribute table and the event field names are the parts most likely to need adjusting for a given engine
      version, and they are deliberately the cheapest things to adjust: both are asserted against a fake engine in the
      package's suite, so correcting a name is a one-line edit with a test that says whether it took.
    </Text>
  </Panel>
)
