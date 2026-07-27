import { addEvent, type LynxElement, onCleanup, type ReadonlySignal, signal } from '@amritk/mini-native'
import { Index, Show } from '@amritk/mini-native/flow'

import { Action, Chip, Panel, Prose, Readout, Row } from '../components'

/**
 * `/events` — the screen the previous playground could not have written.
 *
 * The old runtime owned a five-tag vocabulary with a single `onTap` prop and no
 * propagation at all: an event fired on the element it happened to, and that
 * was the entire model. Lynx has a real event system — a capture phase, a
 * bubble phase, interception through `catch`, and cross-component listeners —
 * and because this runtime spells props exactly the way the engine spells them,
 * all of it is reachable with no release here and no mapping table anywhere.
 *
 * The panels below are in the order the questions come up: what fires and in
 * what order, how to stop it, what the payload looks like, and — last, because
 * it is the part that would have been discovered on a device — what actually
 * happens between a tap and the closure you wrote.
 */
export const EventsScreen = (): LynxElement => (
  <view>
    <Propagation />
    <Interception />
    <GlobalBind />
    <TapPayloads />
    <TouchPayloads />
    <Appearance />
    <ListenerPath />
  </view>
)

// ---------------------------------------------------------------------------
// Propagation
// ---------------------------------------------------------------------------

/**
 * Three nested views, each listening in both phases.
 *
 * The outermost `capture-bindtap` clears the log before recording itself, which
 * is what makes each tap read as one clean sequence rather than as a growing
 * pile. It can do that safely precisely because of the thing being demonstrated:
 * capture runs from the root down, so the outer capture handler is guaranteed to
 * be the first one to hear about any tap inside this box.
 */
const Propagation = (): LynxElement => {
  const log = createLog()

  return (
    <Panel
      title="Bubbling and capture"
      blurb="capture-bind fires on the way DOWN, from the page root to the element under your finger. bind fires on the way back UP. Tap the innermost box and read the log: one dispatch, five handlers, in order."
    >
      <view
        class="card"
        style={LAYER}
        accessibility-element={true}
        accessibility-traits="button"
        accessibility-label="Outer"
        capture-bindtap={() => {
          log.reset()
          log.add('capture-bindtap · outer')
        }}
        bindtap={() => log.add('bindtap · outer')}
      >
        <TextLabel>outer</TextLabel>
        <view
          class="card"
          style={LAYER}
          accessibility-element={true}
          accessibility-traits="button"
          accessibility-label="Middle"
          capture-bindtap={() => log.add('capture-bindtap · middle')}
          bindtap={() => log.add('bindtap · middle')}
        >
          <TextLabel>middle</TextLabel>
          <view
            class="card"
            style={LAYER}
            accessibility-element={true}
            accessibility-traits="button"
            accessibility-label="Inner"
            bindtap={() => log.add('bindtap · inner')}
          >
            <TextLabel>inner — tap me</TextLabel>
          </view>
        </view>
      </view>

      <LogView log={log} />
      <Prose>
        Only touch events have a response chain longer than one node. For every custom event — scroll, layoutchange,
        load, the animation and transition events, the form events — the chain is exactly the node the thing happened
        to, so bind, catch and capture-bind all mean the same thing there and bubbling is not a concept.
      </Prose>
    </Panel>
  )
}

/** `catch` and `capture-catch`, the two ways to stop an event, one per box. */
const Interception = (): LynxElement => {
  const log = createLog()

  return (
    <Panel
      title="catch and capture-catch"
      blurb="catch listens in the bubble phase and stops the event there, so nothing above it hears the tap. capture-catch stops it on the way DOWN, so the element you actually touched never hears it at all."
    >
      <view
        class="card"
        style={LAYER}
        accessibility-element={true}
        accessibility-traits="button"
        accessibility-label="Outer, with a catch in the middle"
        capture-bindtap={() => {
          log.reset()
          log.add('capture-bindtap · outer')
        }}
        bindtap={() => log.add('bindtap · outer — never reached')}
      >
        <TextLabel>outer · bindtap</TextLabel>
        <view class="card" style={LAYER} catchtap={() => log.add('catchtap · middle — stops here')}>
          <TextLabel>middle · catchtap</TextLabel>
          <view
            class="card"
            style={LAYER}
            accessibility-element={true}
            accessibility-traits="button"
            accessibility-label="Inner"
            bindtap={() => log.add('bindtap · inner')}
          >
            <TextLabel>inner — tap me</TextLabel>
          </view>
        </view>
      </view>

      <view
        class="card"
        style={LAYER}
        accessibility-element={true}
        accessibility-traits="button"
        accessibility-label="Outer, with a capture-catch in the middle"
        capture-bindtap={() => {
          log.reset()
          log.add('capture-bindtap · outer')
        }}
        bindtap={() => log.add('bindtap · outer — never reached')}
      >
        <TextLabel>outer · bindtap</TextLabel>
        <view class="card" style={LAYER} capture-catchtap={() => log.add('capture-catchtap · middle — stops here')}>
          <TextLabel>middle · capture-catchtap</TextLabel>
          <view
            class="card"
            style={LAYER}
            accessibility-element={true}
            accessibility-traits="button"
            accessibility-label="Inner, which never hears the tap"
            bindtap={() => log.add('bindtap · inner — never reached')}
          >
            <TextLabel>inner — tap me</TextLabel>
          </view>
        </view>
      </view>

      <LogView log={log} />
      <Prose>
        The prefix decides the engine type string, and the mapping is irregular on purpose: bind becomes bindEvent,
        catch becomes catchEvent, global-bind becomes global-bindEvent, and the two capture forms stay capture-bind and
        capture-catch with no suffix. The engine string-compares those, so tidying them up would produce a listener that
        never fires.
      </Prose>
    </Panel>
  )
}

/** `global-bind` — a listener that is not on the response chain at all. */
const GlobalBind = (): LynxElement => {
  const heard = signal(0)
  const last = signal('nothing yet')

  return (
    <Panel
      title="global-bind"
      blurb="The fifth binding form, and the one that is not about phases. A global-bind listener hears an event wherever in the tree it happened, including from subtrees nowhere near it. Tap the propagation box at the top of this screen and this counter moves, even though nothing connects the two."
    >
      <view
        class="card"
        global-bindtap={(event) => {
          heard(heard() + 1)
          last(`uid ${event.target.uid}${event.target.id === '' ? '' : ` · id ${event.target.id}`}`)
        }}
      >
        <TextLabel>this box is listening to the whole page</TextLabel>
      </view>
      <Row gap="sm">
        <Chip tone={() => (heard() > 0 ? 'good' : 'neutral')}>{() => `${heard()} taps heard`}</Chip>
        <Action onTap={() => heard(0)}>reset</Action>
      </Row>
      <Readout>{() => `last target: ${last()}`}</Readout>
      <Prose>
        global-bind is the only one of the five with no catch counterpart. There are exactly five forms, and
        global-catch is not one of them.
      </Prose>
      <Prose>
        This is also the panel where the preview is furthest from the engine, so it is worth saying what it is doing.
        global-bind is marked NoWeb upstream — Lynx's own web target does not implement it — so the DOM engine here
        approximates it with a listener at the document. That has two consequences you can watch: it fires after the
        whole response chain rather than at a defined point in it, and the catch and capture-catch boxes above do not
        move this counter at all, because interception stops the event before it ever reaches the document. Neither
        should be true on a device, where a global listener is not on the response chain in the first place. Where it
        sits relative to the chain is not specified anywhere, so do not build ordering into an app.
      </Prose>
      <Prose>
        A global listener can be narrowed with the global-target attribute, a comma-separated list of element ids it is
        willing to hear from. That attribute is documented and not declared in the shipped types, so the vocabulary does
        not offer it — a prop that reaches the engine as a dead attribute is worse than one that is missing.
      </Prose>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

/** What `tap`, `longpress` and `longtap` hand you. */
const TapPayloads = (): LynxElement => {
  const shape = signal('tap or long-press the box below')

  return (
    <Panel
      title="tap · longpress · longtap"
      blurb="Every Lynx event carries type, timestamp, target and currentTarget; a touch event adds touches, changedTouches and a detail holding the first finger's position in LynxView coordinates."
    >
      <view
        class="card"
        style={PAD}
        accessibility-element={true}
        accessibility-traits="button"
        accessibility-label="Tap target"
        bindtap={(event) => shape(describeTouch('tap', event))}
        bindlongpress={(event) => shape(describeTouch('longpress', event))}
        bindlongtap={(event) => shape(describeTouch('longtap', event))}
      >
        <TextLabel>tap, or press and hold</TextLabel>
      </view>
      <Readout>{shape}</Readout>
      <Prose>
        tap and longpress are mutually exclusive: bind both and only longpress fires, because it takes precedence.
        longtap is the older spelling of the same gesture — the shipped types still declare it and mark it deprecated —
        so it is bound here beside longpress to show both props are real. In this browser preview a long press arrives
        as the context menu, which is the closest thing a desktop reports.
      </Prose>
      <Prose>
        There is no preventDefault. The types declare one on every event and the documentation is emphatic that Lynx
        does not have it, so the payload this runtime hands a listener does not carry it either — a handler that reached
        for it would compile, appear to work in a preview, and do nothing on a phone. stopPropagation is real, and only
        from a main-thread handler, which is every handler here.
      </Prose>
    </Panel>
  )
}

/** The raw touch stream, and the three coordinate systems a `Touch` reports in. */
const TouchPayloads = (): LynxElement => {
  const phase = signal('idle')
  const point = signal('drag across the pad')

  const track = (name: string, event: { touches: readonly Touch[]; changedTouches: readonly Touch[] }): void => {
    phase(`${name} · ${event.touches.length} touching · ${event.changedTouches.length} changed`)
    const touch = event.changedTouches[0]
    if (touch === undefined) return
    point(
      [
        `element ${round(touch.x)},${round(touch.y)}`,
        `lynxview ${round(touch.pageX)},${round(touch.pageY)}`,
        `window ${round(touch.clientX)},${round(touch.clientY)}`,
      ].join('  ·  '),
    )
  }

  return (
    <Panel
      title="touchstart · touchmove · touchend"
      blurb="The gesture stream underneath tap. A finger that has LEFT the screen appears in changedTouches and not in touches, which is the distinction a recogniser reads to know a stream ended."
    >
      <view
        class="card"
        style={PAD}
        accessibility-element={true}
        accessibility-label="Touch pad"
        bindtouchstart={(event) => track('touchstart', event)}
        bindtouchmove={(event) => track('touchmove', event)}
        bindtouchend={(event) => track('touchend', event)}
        bindtouchcancel={(event) => track('touchcancel', event)}
      >
        <TextLabel>press and drag here</TextLabel>
      </view>
      <Readout>{phase}</Readout>
      <Readout>{point}</Readout>
      <Prose>
        Each Touch reports the same point three times: x and y relative to the element that was touched, pageX and pageY
        relative to the LynxView, and clientX and clientY relative to the window. There is no top-level x or y on the
        event itself — only detail, which carries the first finger's LynxView point, and the per-touch fields.
      </Prose>
    </Panel>
  )
}

/** `uiappear` / `uidisappear`, and the exposure events that are NOT element events. */
const Appearance = (): LynxElement => {
  const seen = signal('nothing yet — see the note below')

  return (
    <Panel
      title="uiappear and uidisappear"
      blurb="Visibility, delivered as an ordinary bound event on the element. The engine runs a timed exposure detection task and reports a node that has come into or gone out of view, with the exposure attributes deciding what counts as visible."
    >
      <view
        class="card"
        style={PAD}
        exposure-id="events-demo"
        exposure-scene="playground"
        exposure-area="30%"
        binduiappear={(event) => seen(`uiappear · ${event.detail['exposure-id']} · uid ${event.detail['unique-id']}`)}
        binduidisappear={(event) => seen(`uidisappear · ${event.detail['exposure-id']}`)}
      >
        <TextLabel>exposure-id · exposure-scene · exposure-area 30%</TextLabel>
      </view>
      <Readout>{seen}</Readout>
      <Prose>
        exposure-area is the intersection ratio that counts as visible, and the ui-margin and screen-margin attributes
        scale the boxes the intersection is measured between. There is no shorthand for either margin — only the four
        sides — and on Android and iOS the ui-margin family does nothing unless enable-exposure-ui-margin is also set.
      </Prose>
      <Prose>
        The readout above stays empty here, and that is honest rather than broken: this preview implements the element
        PAPI over the DOM and has no visibility detection to drive it. On a device it fills as the box scrolls in and
        out.
      </Prose>
      <Prose>
        Worth being precise about the pair that is easy to confuse. exposure and disexposure are NOT element events —
        there is no bindexposure attribute and never was. They are GlobalEventEmitter events, delivered to the
        background thread with an ARRAY payload holding one entry per node whose visibility changed, keyed by sign
        rather than by unique-id. uiappear and uidisappear are the per-node, element-bound equivalents, and they are the
        ones a component can write in its own JSX.
      </Prose>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// The part that would have been found on a device
// ---------------------------------------------------------------------------

/**
 * How a listener actually reaches your closure.
 *
 * Two handlers are attached to the same element for the same `(bindEvent, tap)`
 * pair — one through the `bindtap` prop and one through `addEvent` in a `ref` —
 * because the engine keeps exactly ONE listener per pair and silently overwrites
 * the previous one. Both counters moving is the fan-out layer in `add-event.ts`
 * doing its job.
 */
const ListenerPath = (): LynxElement => {
  const fromProp = signal(0)
  const fromRef = signal(0)
  const probed = signal('not checked yet')

  return (
    <Panel
      title="How a listener reaches your closure"
      blurb="__AddEvent looks like it takes a callback. It does not usefully take one, and the failure is silent — which makes this the single most load-bearing inference in the whole runtime."
    >
      <Prose>
        The parameter accepts three forms. A STRING is a handler name, which the engine routes to the background thread.
        An OBJECT of the shape type worklet plus value is dispatched on the main thread. A FUNCTION is accepted at bind
        time, stored in a field that fiber-architecture dispatch never reads, and then never invoked — no error, no
        warning in JavaScript, one line in native logs. So the naive implementation binds cleanly, renders correctly,
        and does nothing when tapped, on device only.
      </Prose>
      <Prose>
        The way through is a detail of the worklet form: the engine never looks inside value. It fetches a global named
        runWorklet and calls it with the token, the event array and an options object — and runWorklet is supplied by
        the FRAMEWORK, not by the engine. ReactLynx puts a compiler-produced handle there and resolves it against a
        registry its main-thread transform populates. Nothing requires the token to come from a compiler, so this
        runtime hands out integers and installs the runWorklet that resolves them, which is how it stays compilerless
        and still handles events on the main thread with no thread hop.
      </Prose>
      <Row gap="sm">
        <Action onTap={() => probed(describeWorkletGlobal())}>check the global</Action>
        <Readout>{probed}</Readout>
      </Row>

      <view
        class="card"
        style={PAD}
        accessibility-element={true}
        accessibility-traits="button"
        accessibility-label="Two handlers, one pair"
        bindtap={() => fromProp(fromProp() + 1)}
        ref={(element) => {
          // The same `(type, name)` pair the `bindtap` prop above registered.
          // At the engine level the second registration would overwrite the
          // first; the runtime keeps one dispatcher per pair and fans out to a
          // set, which is what `ref` and a gesture recogniser both depend on.
          onCleanup(addEvent(element, 'bindEvent', 'tap', () => fromRef(fromRef() + 1)))
        }}
      >
        <TextLabel>tap: two independent handlers, one engine registration</TextLabel>
      </view>
      <Row gap="sm">
        <Chip tone={() => (fromProp() > 0 ? 'good' : 'neutral')}>{() => `bindtap prop: ${fromProp()}`}</Chip>
        <Chip tone={() => (fromRef() > 0 ? 'good' : 'neutral')}>{() => `addEvent via ref: ${fromRef()}`}</Chip>
      </Row>

      <Prose>
        The honest status, because it matters more than the mechanism. The engine side is read from the engine's own
        source, and the token round-trip is verified in this package's tests against the fake engine — which throws on a
        function listener rather than accepting one, so a test fails where a device would go quiet. It has NOT been
        round-tripped on a physical device. Prototype it there before shipping anything that depends on it. If a
        particular build disagrees, the fallback is contained and already understood: register string handlers and own
        the receiving end, exactly as ReactLynx does, at the cost of a thread hop.
      </Prose>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/**
 * One layer of a nesting demo. Inline rather than a class because `styles.css`
 * is the app's shippable stylesheet and a border that exists only to make three
 * boxes legible on one screen does not belong in it.
 */
const LAYER = { borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', gap: 6 }

/** A tap target with enough room to actually hit with a finger. */
const PAD = { padding: 18, alignItems: 'center' }

/** A line of label text inside a demo box. */
const TextLabel = (props: { children: string }): LynxElement => (
  <text class="card-meta">
    <raw-text text={props.children} />
  </text>
)

/**
 * A short ordered log of which handlers fired.
 *
 * The lines are exposed as a `ReadonlySignal` rather than as the signal itself,
 * so a panel can only append through `add` — which is what keeps the ordering
 * the log claims to show trustworthy.
 */
type EventLog = {
  /** The lines, oldest first. Pass this getter to a binding; never call it in JSX. */
  lines: ReadonlySignal<readonly string[]>
  /** Appends one line. */
  add: (line: string) => void
  /** Starts a fresh sequence. */
  reset: () => void
}

const createLog = (): EventLog => {
  const lines = signal<readonly string[]>([])
  return {
    lines,
    // Capped, because a log that grows without bound on a screen nobody is
    // reading is a memory leak with a user interface.
    add: (line) => lines([...lines(), line].slice(-8)),
    reset: () => lines([]),
  }
}

/**
 * The log, rendered one line per row.
 *
 * Deliberately not a single `Readout` with newlines in it: Lynx lays a text run
 * out the way CSS does, so the newlines would collapse into spaces and the
 * ordering — the entire point of this screen — would be unreadable. `Index` is
 * the right collection component here because the rows are positions in a
 * sequence, and the same handler name can legitimately appear twice.
 */
const LogView = (props: { log: EventLog }): LynxElement => (
  <view class="card">
    <Show when={() => props.log.lines().length === 0}>
      {() => (
        <text class="card-meta">
          <raw-text text="(nothing yet — tap a box above)" />
        </text>
      )}
    </Show>
    <Index each={props.log.lines}>
      {(line, at) => (
        <text class="card-meta" style={MONO}>
          <raw-text text={() => `${at + 1}  ${line()}`} />
        </text>
      )}
    </Index>
  </view>
)

/** The log rows read as a sequence, so they are set in a monospaced face. */
const MONO = { fontFamily: 'monospace', fontSize: 12 }

/** The fields a touch event carries, as one line. */
const describeTouch = (name: string, event: { target: { uid: number }; detail: { x: number; y: number } }): string =>
  `${name} · target uid ${event.target.uid} · detail x ${round(event.detail.x)} y ${round(event.detail.y)}`

/** Whether the runtime has installed the global the engine dispatches through. */
const describeWorkletGlobal = (): string => {
  const installed = (globalThis as { runWorklet?: unknown }).runWorklet
  return typeof installed === 'function' ? 'globalThis.runWorklet: installed' : 'globalThis.runWorklet: absent'
}

/** Coordinates arrive as floats in a browser and as whole pixels on a device. */
const round = (value: number): number => Math.round(value)

/** The subset of a `Touch` these panels read. Lynx's own type carries the rest. */
type Touch = {
  readonly x: number
  readonly y: number
  readonly pageX: number
  readonly pageY: number
  readonly clientX: number
  readonly clientY: number
}
