import {
  type LynxElement,
  type LynxElementApi,
  mount,
  onCleanup,
  requireEngine,
  setEngine,
  signal,
} from '@amritk/mini-lynx'
import { For, Show } from '@amritk/mini-lynx/flow'
import { createFakeEngine, type FakeEngine, serializeTree } from '@amritk/mini-lynx/testing'

import { Action, Chip, Panel, Prose, Readout, Row, Stack, TextLine } from '../components'

/**
 * `/engine` — the runtime driving a second, independent engine, live, in a
 * browser tab.
 *
 * Every other screen shows what a component DOES. This one shows what the
 * runtime does to the engine underneath it, which is only inspectable because
 * the engine is an argument rather than something the runtime reaches for:
 * `createFakeEngine()` from `@amritk/mini-lynx/testing` is a complete
 * in-memory Element PAPI, the same one the package's whole suite runs against,
 * and it records every call it is handed.
 *
 * So the panels below are evidence rather than a diagram. The tree they print is
 * the tree a device would build, the call log is what the runtime actually asked
 * for, and both come from the code that ships rather than from a preview
 * pretending on its behalf.
 */
export const EngineScreen = (): LynxElement => (
  <Stack gap="md">
    <Prose>
      The app around this screen is being rendered by the same runtime through a browser engine — `createDomPapi()` in
      `src/main.tsx`. The panels are a SECOND engine, in memory, with its own tree and its own log. Two engines at once
      is not something an app ever wants, and it is the only honest way to show a device target from a browser: the
      runtime is the constant, and everything below the line is swapped out.
    </Prose>
    <TheTree />
    <CallLog />
    <Creators />
    <Flushing />
    <Events />
  </Stack>
)

/**
 * Runs `body` with `api` installed as the engine, then puts the previous one
 * back.
 *
 * Which engine is installed is normally a boot-time decision made once, and
 * swapping it at runtime is legitimate here for two narrow reasons. The swap is
 * SYNCHRONOUS, so nothing else can render in between; and the previous engine
 * is put back by reference rather than rebuilt, so the live browser tree keeps
 * the engine that already owns its nodes.
 *
 * Every mutation aimed at the second tree has to go through this, and that is
 * the detail worth stating plainly, because it is easy to assume otherwise: a
 * binding does NOT capture the engine it was built under. `bindProp`, `setText`
 * and every tree operation call `requireEngine()` when they RUN, so a signal
 * write that reaches the second tree while the browser's engine is installed
 * would hand a fake element to the browser's PAPI. Reading the engine late is
 * the right design — it is what keeps a swap from stranding a queued commit on
 * an engine nobody is looking at — and it is why the buttons below wrap their
 * writes rather than just calling a setter.
 */
const withEngine = (api: LynxElementApi, body: () => void): void => {
  const previous = requireEngine()
  setEngine(api)
  try {
    body()
  } finally {
    setEngine(previous)
  }
}

/**
 * Mounts a component through `api` and ties its teardown to this screen.
 *
 * The dispose is wrapped too: tearing the subtree down detaches its root, which
 * is a tree operation, which reads the installed engine — so navigating away
 * from this screen with the browser's engine installed would hand it a node it
 * has never seen.
 */
const renderThrough = (api: LynxElementApi, container: LynxElement, component: () => LynxElement): void => {
  withEngine(api, () => {
    const dispose = mount(container, component)
    onCleanup(() => withEngine(api, dispose))
  })
}

/** The common case: a fresh fake engine with a component already mounted into it. */
const renderThroughFake = (component: () => LynxElement): FakeEngine => {
  const engine = createFakeEngine()
  renderThrough(engine.api, engine.pageElement, component)
  return engine
}

/** What the runtime actually builds, printed from the engine's own tree. */
const TheTree = (): LynxElement => {
  const name = signal('Ada Lovelace')
  const verified = signal(false)

  const tree = signal('')
  const calls = signal('(press a button — the log is cleared before each action)')

  const Card = (): LynxElement => (
    <view class="card" style={{ padding: 12, gap: 4 }}>
      <text class="card-title" text-maxline="1">
        <raw-text text={name} />
      </text>
      <Show when={verified}>
        {() => (
          <text class="card-meta">
            <raw-text text="verified" />
          </text>
        )}
      </Show>
    </view>
  )

  const engine = renderThroughFake(Card)
  const read = (): void => tree(serializeTree(engine.page))
  read()

  /** Clears the log, mutates through the second engine, and re-reads both. */
  const act = (body: () => void): void => {
    engine.clearCalls()
    withEngine(engine.api, body)
    calls(engine.calls().join('\n'))
    read()
  }

  return (
    <Panel
      title="The tree a device would build"
      blurb="Three things in here are structure rather than decoration: a text run is a raw-text ELEMENT carrying a `text` attribute, control flow interposes a `wrapper`, and a style bag has become CSS declarations with units on them by the time the engine sees it."
    >
      <Readout>{tree}</Readout>

      <Row gap="sm">
        <Action onTap={() => act(() => name(name() === 'Ada Lovelace' ? 'Grace Hopper' : 'Ada Lovelace'))}>
          rename
        </Action>
        <Action onTap={() => act(() => verified(!verified()))}>toggle the badge</Action>
      </Row>

      <Readout>{calls}</Readout>

      <Prose>
        Renaming writes one signal and costs one `__SetAttribute` on one `raw-text` node. Nothing else in the tree is
        read, compared or rebuilt, because there is nothing to compare it against — the element was created once and the
        binding writes straight to it. That is worth more here than on the web: every one of those calls is real work on
        the main thread rather than a diff against a copy.
      </Prose>
      <Prose>
        Toggling the badge costs more, and the log says exactly how much: a `text` and its `raw-text` are created and
        appended, then inserted into the wrapper `Show` owns. Turning it off removes the subtree and disposes its
        bindings, so the branch that is not showing has genuinely stopped reacting rather than being hidden.
      </Prose>
      <Prose>
        The `wrapper` is Lynx's own element for exactly this — a grouping node that takes part in neither layout nor the
        accessibility tree. A container `view` there would silently turn a list inside a flex row into one flex item
        instead of many, and would sit between a list and its items where a screen reader can find it.
      </Prose>
    </Panel>
  )
}

/** The reconciler's cost, made countable. */
const CallLog = (): LynxElement => {
  // Read only by the second tree. Nothing rendered by the BROWSER's engine may
  // read it, which is a rule this panel learned the hard way: a `disabled`
  // getter on the buttons below that consulted `rows` would re-run while the
  // second engine was installed, and the browser's own button elements would
  // take a `__SetClasses` on the fake. `size` is the mirror the buttons read
  // instead, written after the swap has been undone.
  const rows = signal<readonly string[]>(['alpha', 'beta', 'gamma'])

  const size = signal(3)
  const calls = signal('(press a button — the log is cleared before each action)')
  const count = signal(0)

  const Rows = (): LynxElement => (
    <For each={rows} key={(row) => row} as="view" class="gap-xs">
      {(row) => (
        <view class="card">
          <text class="card-title">
            <raw-text text={row} />
          </text>
        </view>
      )}
    </For>
  )

  const engine = renderThroughFake(Rows)

  const act = (body: () => void): void => {
    engine.clearCalls()
    withEngine(engine.api, body)
    const log = engine.calls()
    calls(log.length === 0 ? '(no engine calls at all)' : log.join('\n'))
    count(log.length)
    size(rows().length)
  }

  return (
    <Panel
      title="Every call the runtime makes"
      blurb="`list` is the only reconciler in the package, it is keyed, and it is move-minimal. Moving the last row to the front is the interesting button: a moved row costs one __RemoveElement and one __InsertElementBefore, because an insert detaches first and therefore doubles as a move, and nothing is rebuilt."
    >
      <Row gap="sm">
        <Action
          onTap={() =>
            act(() => {
              const current = rows()
              const last = current[current.length - 1]
              if (last !== undefined) rows([last, ...current.slice(0, -1)])
            })
          }
          disabled={() => size() < 2}
        >
          move the last row first
        </Action>
        <Action onTap={() => act(() => rows([...rows(), `row ${rows().length + 1}`]))}>append a row</Action>
        <Action onTap={() => act(() => rows(rows().slice(1)))} disabled={() => size() === 0}>
          drop the first
        </Action>
        <Action onTap={() => act(() => rows([]))} disabled={() => size() === 0}>
          clear
        </Action>
      </Row>

      <Chip tone={() => (count() === 0 ? 'neutral' : 'good')}>
        {() => `${count()} engine call${count() === 1 ? '' : 's'}`}
      </Chip>
      <Readout>{calls}</Readout>

      <Prose>
        Appending is the other number worth reading: the new row is created and placed, and not one existing row is
        touched. The naive alternative — walk the new order and insert anything not already sitting where it should — is
        much shorter and degrades badly on exactly the two edits people perform most, re-inserting every row after a
        removal from the middle. On a native target that is a call across the boundary per row for an edit that should
        have cost none.
      </Prose>
      <Prose>
        `__GetParent` does not appear in the log because the fake engine does not record the reads, only the mutations.
        Clearing the whole collection is the one case that does not go row by row: the container belongs exclusively to
        this list, so every scope is disposed and the container emptied.
      </Prose>
    </Panel>
  )
}

/**
 * The per-tag creators, and why picking the wrong one is a correctness bug.
 *
 * The fake engine deliberately implements none of them — they are optional on
 * `LynxElementApi` precisely so a fake may leave them out, and `createElement`
 * falls back to `__CreateElement`, which is the right call for a tag with no
 * dedicated creator. So this panel installs a thin recording layer over the fake
 * that implements all six, which is what a device engine looks like, and notes
 * which one the runtime reached for.
 */
const withCreators = (engine: FakeEngine, note: (line: string) => void): LynxElementApi => {
  const through = (creator: string, tag: string, id: number): LynxElement => {
    note(`${creator}(${id})`.padEnd(32) + `→ <${tag}>`)
    return engine.api.__CreateElement(tag, id, {})
  }

  return {
    ...engine.api,
    __CreateElement: (tag, id, info) => {
      note(`__CreateElement("${tag}", ${id})`.padEnd(32) + `→ <${tag}>`)
      return engine.api.__CreateElement(tag, id, info)
    },
    __CreateRawText: (text) => {
      note('__CreateRawText(…)'.padEnd(32) + '→ <raw-text>')
      return engine.api.__CreateRawText(text)
    },
    __CreateWrapperElement: (id) => {
      note(`__CreateWrapperElement(${id})`.padEnd(32) + '→ <wrapper>')
      return engine.api.__CreateWrapperElement(id)
    },
    __CreateView: (id) => through('__CreateView', 'view', id),
    __CreateText: (id) => through('__CreateText', 'text', id),
    __CreateImage: (id) => through('__CreateImage', 'image', id),
    __CreateScrollView: (id) => through('__CreateScrollView', 'scroll-view', id),
    __CreateFrame: (id) => through('__CreateFrame', 'frame', id),
    __CreateList: (id) => through('__CreateList', 'list', id),
  }
}

/**
 * One element per creator, so the choice is visible for every tag at once.
 *
 * The text runs are written as bare strings rather than as `<raw-text>`
 * elements, because that is the difference between the two: a string child of a
 * `<text>` is built with `__CreateRawText`, while authoring the tag by hand
 * builds it like any other element with no dedicated creator.
 */
const Creators = (): LynxElement => {
  const Sampler = (): LynxElement => (
    <view class="card">
      <text class="card-title">a text run</text>
      <image src="ada.png" mode="aspectFit" />
      <scroll-view scroll-orientation="horizontal" />
      <frame src="another-lynx-page" />
      <list list-type="single" span-count={1}>
        <list-item item-key="one">
          <text>a recycled row</text>
        </list-item>
      </list>
      <input class="field" type="text" placeholder="an input" />
      <textarea class="field" placeholder="a textarea" />
      <Show when={true}>{() => <text class="card-meta">and a branch, in the wrapper Show owns</text>}</Show>
    </view>
  )

  const engine = createFakeEngine()
  const lines: string[] = []
  renderThrough(
    withCreators(engine, (line) => lines.push(line)),
    engine.pageElement,
    Sampler,
  )

  return (
    <Panel
      title="A view is built with __CreateView, an input with __CreateElement"
      blurb="This is the distinction that reads like a fast path and is not one. Lynx's documentation says a built-in tag “cannot use __CreateElement and must use its respective Create API”, and that turns out to be literally true."
    >
      <Readout>{lines.join('\n')}</Readout>

      <Prose>
        `__CreateElement` builds a generic fiber node for every tag but one. A `view` made that way is not a view: it
        loses `is_view()` and with it the layout-only optimisation, a `text` loses text measurement, an `image` loses
        `src` handling, and a `list` loses virtualisation. Nothing errors and nothing warns — the element simply does
        less, which is the worst possible way for this to fail, because the screen comes up and looks nearly right.
      </Prose>
      <Prose>
        So `__CreateElement` is correct for exactly the tags with no dedicated creator — `input`, `textarea`, `svg`,
        `webview` and every XElement — and mandatory to avoid for the ones that have one. `CREATORS` in `tree.ts` is
        that table, and it is short because the engine's list is short.
      </Prose>
      <Prose>
        Read the log rather than the claim, which is the whole reason this panel prints one. `LynxElementApi` declares
        six per-tag creators and `CREATORS` routes five of them — `view`, `text`, `image`, `scroll-view` and `frame` —
        so a `list` currently arrives through `__CreateElement` even though `__CreateList` is right there on the
        boundary. By the note on the type's own declaration, that is the case where a `list` loses virtualisation, which
        makes it worth a line in a table rather than a discovery on a device.
      </Prose>
      <Prose>
        The other panels on this screen log `__CreateElement("view", …)` for everything, and that is not the runtime
        making a different choice. The fake engine implements none of the dedicated creators — they are optional on
        `LynxElementApi` exactly so that a fake may leave them out, and `createElement` falls back correctly when one is
        missing. This panel is the fake with a recording layer over it that supplies all six, which is what a device
        engine looks like.
      </Prose>
      <Prose>
        The trap underneath the trap: the engine's own web port calls `__CreateElement` with built-in tags and passes
        its tests, because on the web every tag is a custom element and the distinction does not exist. The browser
        preview around this screen behaves the same way. That is the clearest statement of why the web target cannot be
        used to validate an assumption about the native one — and why this panel prints which creator was CHOSEN rather
        than checking whether the result looked right.
      </Prose>
      <Prose>
        The number in each call is the `parentComponentUniqueId`, and it is the page's real id rather than `0`. Zero
        reads like a harmless “no owning component” sentinel and is not one: engine ids start well above it, so an
        element created with zero drops out of class, id and tag selector resolution. The tree renders, inline styles
        work, and every stylesheet rule quietly misses.
      </Prose>
    </Panel>
  )
}

/** Nothing reaches a screen until the tree is committed. */
const Flushing = (): LynxElement => {
  const count = signal(0)

  const writes = signal(0)
  const flushes = signal(0)

  const Counter = (): LynxElement => (
    <view class="card">
      <text class="card-title">
        <raw-text text={() => `count: ${count()}`} />
      </text>
    </view>
  )

  const engine = renderThroughFake(Counter)
  engine.clearCalls()
  flushes(engine.flushes())

  const mutate = (times: number): void => {
    withEngine(engine.api, () => {
      for (let index = 0; index < times; index += 1) count(count() + 1)
    })
    writes(engine.calls().length)
    flushes(engine.flushes())
  }

  const commit = (): void => {
    engine.api.__FlushElementTree()
    engine.clearCalls()
    writes(0)
    flushes(engine.flushes())
  }

  return (
    <Panel
      title="A tick costs exactly one commit"
      blurb="Nothing appears on a Lynx screen until __FlushElementTree runs, and flushing is not free — so however many attributes a tick wrote, the runtime asks the engine to commit once. Mutate twenty-five times and watch the flush count stay where it is."
    >
      <Row gap="sm">
        <Action onTap={() => mutate(1)}>mutate ×1</Action>
        <Action onTap={() => mutate(25)}>mutate ×25</Action>
        <Action onTap={commit} disabled={() => writes() === 0}>
          commit
        </Action>
      </Row>

      <Readout>
        {() =>
          [
            `attribute writes since the last commit: ${writes()}`,
            `__FlushElementTree calls so far:        ${flushes()}`,
          ].join('\n')
        }
      </Readout>

      <Chip tone={() => (writes() === 0 ? 'good' : 'neutral')}>
        {() => (writes() === 0 ? 'committed' : `${writes()} write(s) pending`)}
      </Chip>

      <Prose>
        The commit here is by hand, and the reason is the same design that makes an engine swap safe. `scheduleFlush`
        reads the installed engine when the queued microtask RUNS rather than when it was scheduled — closing over it
        would strand a commit on an outgoing engine — and by the end of this tick the browser's engine is back, so it is
        the one that gets flushed. On a device there is one engine and the runtime does this for you, once per tick,
        with nothing to press.
      </Prose>
      <Prose>
        This is also the one class of defect a browser preview structurally cannot show you. The DOM is eager, so a
        mutation that never gets committed still appears there; on a device it appears only when something else happens
        to flush, which looks like a race rather than like the missing call it is. A fake engine that counts commits is
        where that gets caught, and `mount` is the one deliberate exception to the rule — it commits synchronously,
        because the first screen cannot wait for the end of a tick.
      </Prose>
    </Panel>
  )
}

/** Just the part of a Lynx tap payload this panel prints. */
type TapEvent = {
  readonly detail: {
    readonly x: number
    readonly y: number
  }
}

/** An event, from the engine's dispatch all the way to a closure. */
const Events = (): LynxElement => {
  const received = signal<readonly string[]>([])
  const note = (line: string): void => received([line, ...received()].slice(0, 6))

  const Surface = (): LynxElement => (
    <view
      class="card"
      accessibility-element={true}
      accessibility-traits="button"
      accessibility-label="Tap target"
      bindtap={(event: TapEvent) => note(`tap       → x ${event.detail.x}, y ${event.detail.y}`)}
      bindlongpress={() => note('longpress → (this one carries no payload here)')}
    >
      <text class="card-title">
        <raw-text text="the element the handlers are on" />
      </text>
    </view>
  )

  const engine = renderThroughFake(Surface)
  const target = engine.find('view')
  const registrations = engine.calls().filter((line) => line.startsWith('__AddEvent'))

  /** The token the engine is holding for `tap`, read straight back off the element. */
  const handle = (): string => {
    const listener = target?.events.get('bindEvent:tap')
    return listener === undefined ? '(nothing bound)' : JSON.stringify(listener)
  }

  const fire = (name: string, event: unknown): void => {
    if (target === undefined) return
    engine.dispatch(target, name, event)
  }

  return (
    <Panel
      title="Events, end to end"
      blurb="Press a button and the engine dispatches at its own element, exactly as a device would — through the global runWorklet rather than by reaching for the closure. The payload is the engine's shape, so a handler reading event.detail.x is reading the real thing."
    >
      <Row gap="sm">
        <Action onTap={() => fire('tap', { detail: { x: 24, y: 91 } })}>engine: tap</Action>
        <Action onTap={() => fire('tap', { detail: { x: 180, y: 12 } })}>engine: tap elsewhere</Action>
        <Action onTap={() => fire('longpress', { detail: { x: 24, y: 91 } })}>engine: longpress</Action>
        <Action onTap={() => received([])} disabled={() => received().length === 0}>
          clear
        </Action>
      </Row>

      <Readout>{() => (received().length === 0 ? '(dispatch an engine event above)' : received().join('\n'))}</Readout>

      <TextLine class="card-meta">what the engine is holding</TextLine>
      <Readout>
        {() =>
          [
            ...registrations,
            '',
            `listener for bindEvent:tap = ${handle()}`,
            `typeof globalThis.runWorklet = ${typeof (globalThis as { runWorklet?: unknown }).runWorklet}`,
          ].join('\n')
        }
      </Readout>

      <Prose>
        `__AddEvent` looks like it takes a callback and does not usefully take one. A string names a handler the engine
        routes to the background thread; an object of the shape shown above is dispatched on the main thread; and a raw
        function is accepted at bind time, stored in a field that fiber-arch dispatch does not read, and then silently
        never invoked. No error, no JavaScript warning, one line in native logs — so the naive implementation binds
        cleanly, renders correctly, and does nothing when tapped, on a device only.
      </Prose>
      <Prose>
        The way through is a detail of the worklet form: the engine never looks inside `value`. It fetches a global
        named `runWorklet` and calls it with the token untouched — and `runWorklet` is supplied by the FRAMEWORK rather
        than by the engine. ReactLynx puts a compiler-produced handle there and resolves it against a registry its main
        thread transform populates. Nothing requires the token to come from a compiler, so this runtime hands out
        integers and installs the `runWorklet` that resolves them, which is what lets it handle main-thread events with
        no build step at all.
      </Prose>
      <Prose>
        Worth flagging honestly, because it is the most load-bearing inference in the package: the engine-side mechanism
        is read from the engine's own source, and the round trip above is verified against this fake engine — but a
        framework-defined token has NOT been round-tripped on a physical device by this package. Prototype it on a
        device before shipping anything that depends on it. The fallback is contained and already understood: register
        string handlers and own the receiving end by assigning `lynxCoreInject.tt.publishEvent`, exactly as ReactLynx
        does, at the cost of a thread hop.
      </Prose>
      <Prose>
        Two smaller constraints are visible in the same readout. The engine keeps ONE listener per (type, name) pair and
        overwrites silently, which is why the runtime registers a single dispatcher per pair and fans out to a handler
        set it owns — otherwise a `ref` attaching its own listener would quietly remove the component's. And the fake
        THROWS on a function listener rather than accepting one, so the mistake fails in a test where a device would go
        quiet.
      </Prose>
    </Panel>
  )
}
