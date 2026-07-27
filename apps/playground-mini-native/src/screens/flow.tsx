import { computed, type LynxElement, list, onCleanup, signal } from '@amritk/mini-native'
import { Dynamic, For, Index, Match, Show, Switch } from '@amritk/mini-native/flow'

import { Action, Chip, Panel, Prose, Readout, Row, TextLine } from '../components'

/**
 * `/flow` — structural change, and the element it renders into.
 *
 * Nothing here diffs. A branch that leaves the tree is genuinely disposed — its
 * effects stopped, its `onCleanup` callbacks run — and the branch that arrives
 * is built from scratch. That is worth more on a device than it is in a browser:
 * a subtree that stays mounted but stops being visible is a subtree still
 * holding real platform views and still reacting to every signal it reads.
 *
 * The last panel is the one that is new. Every component below renders into a
 * `wrapper`, which on Lynx is a REAL element the engine builds and treats as
 * transparent to both layout and accessibility. The previous multi-target
 * version of this package had to fake that on every target it supported.
 */
export const FlowScreen = (): LynxElement => (
  <view>
    <ShowDemo />
    <NarrowingShow />
    <SwitchDemo />
    <ForDemo />
    <IndexDemo />
    <DynamicDemo />
    <ListDemo />
    <WrapperDemo />
  </view>
)

// ---------------------------------------------------------------------------
// Conditionals
// ---------------------------------------------------------------------------

/** `Show` — and the difference between handing it a factory and handing it a node. */
const ShowDemo = (): LynxElement => {
  const open = signal(false)
  const builds = signal(0)
  const taps = signal(0)

  // Built HERE, in the component body, so it belongs to this component's scope
  // rather than to the branch's. `Show` removes it from the tree and puts the
  // same node back — nothing about it was ever torn down, which is why the
  // counter inside it survives a round trip and the factory's does not.
  const prebuilt = (
    <view class="card">
      <TextLine>a node built once, outside the branch</TextLine>
      <Action onTap={() => taps(taps() + 1)}>{() => `tapped ${taps()} times`}</Action>
    </view>
  )

  return (
    <Panel
      title="Show"
      blurb="Truthy renders children, falsy renders fallback, and the branch that leaves is genuinely removed rather than hidden. Toggle a few times and compare the two counters: the factory is rebuilt on every entry, the prebuilt node is reused."
    >
      <Action onTap={() => open(!open())}>{() => (open() ? 'hide both' : 'show both')}</Action>

      <Show when={open} fallback={() => <TextLine class="card-meta">nothing is mounted right now</TextLine>}>
        {() => {
          // Runs on every entry, because the factory form really is rebuilt.
          builds(builds() + 1)
          return <Readout>{() => `factory branch · built ${builds()} time(s)`}</Readout>
        }}
      </Show>

      <Show when={open}>{prebuilt}</Show>

      <Prose>
        Use the show PROP instead when the element should stay alive and merely become invisible — that keeps its
        bindings running and writes one visibility declaration. Use this component when the branch should genuinely go
        away, along with everything it subscribed to.
      </Prose>
    </Panel>
  )
}

/** One signed-in session, or nothing. */
type Session = { readonly user: string; readonly since: string }

/** `Show` handing the branch a getter for the value that satisfied `when`. */
const NarrowingShow = (): LynxElement => {
  const session = signal<Session | null>(null)

  return (
    <Panel
      title="Show, narrowed"
      blurb="The child may take one argument: a getter for whatever satisfied when, with the nullish half of its type already removed. It is a GETTER rather than a value, which is what keeps a truthy-to-truthy change cheap — the branch stays exactly where it is and only the bindings inside it update."
    >
      <Row gap="sm">
        <Action onTap={() => session({ user: 'ada', since: stamp() })}>sign in as ada</Action>
        <Action onTap={() => session({ user: 'grace', since: stamp() })}>sign in as grace</Action>
        <Action onTap={() => session(null)}>sign out</Action>
      </Row>
      <Show when={session} fallback={() => <TextLine class="card-meta">signed out</TextLine>}>
        {(current) => <Readout>{() => `${current().user}, since ${current().since}`}</Readout>}
      </Show>
      <Prose>
        Switching between the two users never rebuilds the branch, because the selection resolved to the same factory
        both times. Signing out and back in does rebuild it, because the selection changed. That distinction is the
        whole of what the wrapper underneath is deciding on every tick.
      </Prose>
    </Panel>
  )
}

/** Every state the demo below can be in, in the order the branches are tried. */
const STATES = ['idle', 'loading', 'error', 'ready'] as const

/** `Switch` and `Match` — the multi-way conditional `Show` is the shortcut for. */
const SwitchDemo = (): LynxElement => {
  const state = signal<(typeof STATES)[number]>('idle')

  return (
    <Panel
      title="Switch and Match"
      blurb="Branches are tested in source order and only the winner is ever built, so the three you are not showing create no elements and no bindings at all. On a device that is three view trees not crossing into the platform."
    >
      <Row gap="xs" wrap={true}>
        <For each={STATES}>
          {(name) => (
            <Action onTap={() => state(name)} disabled={() => state() === name}>
              {name}
            </Action>
          )}
        </For>
      </Row>
      <Switch fallback={() => <TextLine class="card-meta">no branch matched — this is the idle state</TextLine>}>
        <Match when={() => state() === 'loading'}>{() => <Chip>loading…</Chip>}</Match>
        <Match when={() => state() === 'error'}>{() => <Chip tone="bad">something broke</Chip>}</Match>
        <Match when={() => state() === 'ready'}>{() => <Chip tone="good">ready</Chip>}</Match>
      </Switch>
      <Prose>
        A Match renders nothing itself. It hands back an unmounted carrier holding its condition and its content, which
        the enclosing Switch reads — asking the engine for a real element there would build a view for every branch
        including the ones that never render, which is free in a browser and decidedly not free on a phone.
      </Prose>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/** One row of the keyed list below. */
type Task = { readonly id: string; readonly title: string }

const SEED: readonly Task[] = [
  { id: 'a', title: 'drive the Element PAPI' },
  { id: 'b', title: 'derive the vocabulary' },
  { id: 'c', title: 'ship the preview' },
]

/** `For` — keyed rows that carry their own state through a reorder. */
const ForDemo = (): LynxElement => {
  const tasks = signal<readonly Task[]>(SEED)

  return (
    <Panel
      title="For"
      blurb="One node per key. Tap a row or two to give it some local state, then reverse the list: the state travels with the row, because the key is the row's identity and the node is repositioned rather than rebuilt."
    >
      <Row gap="sm">
        <Action onTap={() => tasks([...tasks()].reverse())}>reverse</Action>
        <Action onTap={() => tasks(tasks().slice(1))}>drop the first</Action>
        <Action onTap={() => tasks(SEED)}>reset</Action>
      </Row>
      <For each={tasks} key={(task) => task.id}>
        {(task) => {
          const taps = signal(0)
          return (
            <view
              class="card row"
              style={{ justifyContent: 'space-between' }}
              accessibility-element={true}
              accessibility-traits="button"
              accessibility-label={task.title}
              bindtap={() => taps(taps() + 1)}
            >
              <TextLine>{task.title}</TextLine>
              <TextLine class="card-meta">{() => `${taps()}×`}</TextLine>
            </view>
          )
        }}
      </For>
      <Prose>
        Reconciliation is move-minimal: appending, replacing the tail, swapping a pair and removing from the middle all
        cost zero moves, and a genuine move costs one insert. That matters more here than on the web, because every move
        is a call into the platform rather than a pointer swap in a document.
      </Prose>
    </Panel>
  )
}

/** `Index` — one row per SLOT, for collections whose values legitimately repeat. */
const IndexDemo = (): LynxElement => {
  const colours = signal<readonly string[]>(['red', 'red', 'blue'])

  const rotate = (): void => {
    const [first, ...rest] = colours()
    colours(first === undefined ? [] : [...rest, first])
  }

  return (
    <Panel
      title="Index"
      blurb="For is the right default; this is the answer for the lists it cannot key honestly. Two reds hand two rows the same key, which list reports and drops — so here the POSITION is the identity and each row receives a getter for whatever currently occupies its slot."
    >
      <Row gap="sm">
        <Action onTap={rotate}>rotate</Action>
        <Action onTap={() => colours([...colours(), 'green'])}>append green</Action>
        <Action onTap={() => colours(['red', 'red', 'blue'])}>reset</Action>
      </Row>
      <Index each={colours}>
        {(colour, at) => <Readout>{() => `slot ${at} holds "${colour()}" — this row was never rebuilt`}</Readout>}
      </Index>
      <Prose>
        The reason this has to be a component rather than just a key function is the part that is easy to get wrong. A
        row is built once and never rebuilt, so if position were merely used as a key, inserting at the front would
        leave every later slot showing the item that used to sit there. Handing each row a getter for its slot is what
        closes that hole: the node stays and the bindings inside it re-read.
      </Prose>
      <Prose>
        The trade is inherent to slot identity. A row does not travel with its data, so focus, a scroll position and a
        half-typed input belong to the position rather than to the item. When that matters, give the items real
        identities and use For.
      </Prose>
    </Panel>
  )
}

/** `Dynamic` — the general subtree swap both conditionals are built on. */
const DynamicDemo = (): LynxElement => {
  const tab = signal<'summary' | 'detail' | 'none'>('summary')

  const summary = (): LynxElement => <Readout>a summary subtree</Readout>
  const detail = (): LynxElement => (
    <view class="gap-xs">
      <Readout>a completely different subtree</Readout>
      <Chip tone="good">built fresh on every swap</Chip>
    </view>
  )

  return (
    <Panel
      title="Dynamic"
      blurb="Whenever the selected builder changes, the previous subtree is disposed before the next one is built. That makes it the right primitive for routed screens and tab bodies, where the branch leaving must not keep reacting in the background — which is exactly what RouteView uses it for."
    >
      <Row gap="xs">
        <Action onTap={() => tab('summary')}>summary</Action>
        <Action onTap={() => tab('detail')}>detail</Action>
        <Action onTap={() => tab('none')}>nothing</Action>
      </Row>
      <Dynamic>{() => (tab() === 'summary' ? summary : tab() === 'detail' ? detail : null)}</Dynamic>
    </Panel>
  )
}

/** `list` — the only reconciler in the package, driven directly. */
const ListDemo = (): LynxElement => {
  const rows = signal<readonly string[]>(['alpha', 'beta', 'gamma'])
  const live = signal(0)
  const total = computed(() => rows().length)

  // A plain counter mirrored into the signal, rather than read from it. `create`
  // runs inside the list's own tracking effect, so reading `live()` in there
  // would make the list depend on a signal it writes and the effect would
  // re-trigger itself forever.
  let scopes = 0
  const countScopes = (delta: number): void => {
    scopes += delta
    live(scopes)
  }

  let next = 1

  return (
    <Panel
      title="list"
      blurb="The primitive under For and Index, and the one place in the package where nodes are created, moved and destroyed. Each row opens its own scope; the counter below is incremented on create and decremented from the row's own onCleanup, so it reads out exactly how many the list is holding."
    >
      <Row gap="sm">
        <Action onTap={() => rows([`row ${next++}`, ...rows()])}>add</Action>
        <Action onTap={() => rows(rows().slice(1))}>drop first</Action>
        <Action onTap={() => rows([])}>clear</Action>
      </Row>
      <view
        class="gap-xs"
        ref={(container) => {
          // The container belongs to this list and nothing else may insert into
          // it — that exclusive ownership is what lets the reconciler treat
          // child order as its own bookkeeping.
          list(
            container,
            rows,
            (row) => row,
            (row) => {
              countScopes(1)
              onCleanup(() => countScopes(-1))
              return <TextLine class="card">{row}</TextLine>
            },
          )
        }}
      />
      <Readout>{() => `rows: ${total()} · live scopes: ${live()}`}</Readout>
      <Prose>
        It needs four operations from the engine — insert, remove, clear and nextSibling — which is why this half of the
        runtime ported to Lynx without a line changing. Only the code that touches nodes needed the Element PAPI
        underneath it.
      </Prose>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// The element all of the above renders into
// ---------------------------------------------------------------------------

const TAGS: readonly string[] = ['view', 'text', 'list', 'scroll-view']

/**
 * `wrapper` — the slot every control-flow component owns.
 *
 * The two rows below are the same markup with one prop changed, and the
 * difference is the whole argument: `as="view"` makes the rows into ONE flex
 * item, because a `view` takes part in layout. The default wrapper does not.
 */
const WrapperDemo = (): LynxElement => (
  <Panel
    title="wrapper"
    blurb="Control flow has to own a slot in the tree, and that slot must not change what the tree MEANS. Lynx has a first-class element for exactly this, so the problem is solved by using the engine's answer rather than by working around its absence."
  >
    <TextLine class="card-meta">default — the For renders into a wrapper</TextLine>
    <view class="row gap-xs wrap">
      <Chip>static</Chip>
      <For each={TAGS}>{(tag) => <Chip>{tag}</Chip>}</For>
    </view>

    <TextLine class="card-meta">as="view" — the same rows, now inside one flex item</TextLine>
    <view class="row gap-xs wrap">
      <Chip>static</Chip>
      <For as="view" each={TAGS} class="gap-xs">
        {(tag) => <Chip>{tag}</Chip>}
      </For>
    </view>

    <Prose>
      The engine builds it through its own creator, CreateWrapperElement, and treats it as transparent to layout and to
      the accessibility tree. So a For inside a flex row stays many flex items rather than becoming one, and a wrapper
      never sits between a list and its items where a screen reader would notice it.
    </Prose>
    <Prose>
      The previous multi-target version of this package had to approximate that on every target: create a container
      view, mark it as not an accessibility element, and hope layout did not notice. Here the engine simply has the
      element. It is a small thing that stands for the larger trade — the ceiling moved from what this package had named
      to what the engine can do.
    </Prose>
    <Prose>
      A wrapper gets no style, no class and no show prop, and that is not an oversight. An element outside layout has
      nothing for any of the three to act on, and offering them would only invite someone to style the one node that
      cannot be styled. Pass as when the container itself needs to be styled, to scroll, or to carry semantics.
    </Prose>
  </Panel>
)

/** A wall-clock stamp, so a rebuilt branch is visibly a different one. */
const stamp = (): string => new Date().toLocaleTimeString()
