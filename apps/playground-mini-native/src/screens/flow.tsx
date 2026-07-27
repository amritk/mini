import { computed, type HostElement, list, onCleanup, signal } from '@amritk/mini-native'
import { Dynamic, For, Index, Match, Show, Switch, VirtualFor } from '@amritk/mini-native/flow'
import { Row, Stack, Text } from '@amritk/mini-native/ui'

import { Action, Chip, Panel, Readout } from '../lib/ui'
import { PaletteContext, RADIUS } from '../theme'

/**
 * `@amritk/mini-native/flow` — the structural half. Each component renders into
 * a wrapper the host supplies (`createFlowHost`), which is what keeps them
 * platform-neutral: there is no `<div>` to reach for, so the host decides what
 * a neutral container is on its target.
 */
export const FlowScreen = (): HostElement => (
  <Stack gap="md">
    <Text tone="muted" size="sm">
      Structural changes are real add and remove — the branch that leaves is disposed, its effects stopped and its
      onCleanup callbacks run, and the one that arrives is built from scratch. Nothing here diffs.
    </Text>
    <ShowDemo />
    <NarrowingShow />
    <SwitchDemo />
    <ForDemo />
    <IndexDemo />
    <DynamicDemo />
    <VirtualForDemo />
    <ListDemo />
  </Stack>
)

/** `<Show>` — and the difference between a node and a factory. */
const ShowDemo = (): HostElement => {
  const open = signal(false)
  const builds = signal(0)

  return (
    <Panel
      title="Show"
      blurb="A factory is lazy and rebuilt on re-entry; an already-built element is reused, so its state survives. Both tear the outgoing branch down."
    >
      <Action onTap={() => open(!open())}>{() => (open() ? 'collapse' : 'expand')}</Action>
      <Show when={open} fallback={() => <Text tone="muted">nothing is mounted right now</Text>}>
        {() => {
          // Runs on every entry, because the factory form is genuinely rebuilt.
          builds(builds() + 1)
          return <Readout>{() => `built ${builds()} time(s)`}</Readout>
        }}
      </Show>
    </Panel>
  )
}

/** `<Show>` handing the branch a getter for the narrowed value. */
type Session = { readonly user: string; readonly since: string }

const NarrowingShow = (): HostElement => {
  const session = signal<Session | null>(null)

  return (
    <Panel
      title="Show, narrowed"
      blurb="The child may take one argument — a getter for whatever satisfied `when`, with the nullish half of its type already removed. The branch reads it without re-checking anything."
    >
      <Row gap="sm">
        <Action onTap={() => session({ user: 'ada', since: new Date().toLocaleTimeString() })}>sign in</Action>
        <Action onTap={() => session(null)}>sign out</Action>
      </Row>
      <Show when={session} fallback={() => <Text tone="muted">signed out</Text>}>
        {(current) => <Readout>{() => `${current().user}, since ${current().since}`}</Readout>}
      </Show>
    </Panel>
  )
}

/** `<Switch>` / `<Match>` — first truthy branch wins, and only it is built. */
const SwitchDemo = (): HostElement => {
  const state = signal<'idle' | 'loading' | 'error' | 'ready'>('idle')
  const states = ['idle', 'loading', 'error', 'ready'] as const

  return (
    <Panel
      title="Switch / Match"
      blurb="Branches are tried in source order. A Match carries its condition and content on an unmounted carrier the Switch reads — asking the host for a real element there would create a view for every branch that never renders."
    >
      <Row gap="xs">
        <For each={states}>
          {(name) => (
            <Action onTap={() => state(name)} disabled={() => state() === name}>
              {name}
            </Action>
          )}
        </For>
      </Row>
      <Switch fallback={() => <Text tone="muted">no branch matched</Text>}>
        <Match when={() => state() === 'loading'}>{() => <Chip>loading…</Chip>}</Match>
        <Match when={() => state() === 'error'}>{() => <Chip tone="bad">something broke</Chip>}</Match>
        <Match when={() => state() === 'ready'}>{() => <Chip tone="good">ready</Chip>}</Match>
      </Switch>
    </Panel>
  )
}

/** `<For>` — keyed rows that follow their data through a reorder. */
type Task = { readonly id: string; readonly title: string }

const SEED: readonly Task[] = [
  { id: 'a', title: 'implement Host' },
  { id: 'b', title: 'ship the preview' },
  { id: 'c', title: 'measure the bundle' },
]

const ForDemo = (): HostElement => {
  const palette = PaletteContext.use()
  const tasks = signal<readonly Task[]>(SEED)

  return (
    <Panel
      title="For"
      blurb="Move-minimal and keyed: a row is only touched when its position genuinely changes. Give a row some local state, then reverse the list — the state travels with it, because the key is its identity."
    >
      <Row gap="sm">
        <Action onTap={() => tasks([...tasks()].reverse())}>reverse</Action>
        <Action onTap={() => tasks(SEED)}>reset</Action>
      </Row>
      <For each={tasks} key={(task) => task.id}>
        {(task) => {
          const taps = signal(0)
          return (
            <view
              role="button"
              onTap={() => taps(taps() + 1)}
              style={() => ({
                flexDirection: 'row',
                justifyContent: 'space-between',
                padding: 10,
                marginBottom: 6,
                borderRadius: RADIUS.sm,
                background: palette().surfaceAlt,
              })}
            >
              <text style={() => ({ color: palette().text, fontSize: 14 })}>{task.title}</text>
              <text style={() => ({ color: palette().muted, fontSize: 14 })}>{() => `${taps()}×`}</text>
            </view>
          )
        }}
      </For>
    </Panel>
  )
}

/** `<Index>` — one row per SLOT, for values that may legitimately repeat. */
const IndexDemo = (): HostElement => {
  const colours = signal<readonly string[]>(['red', 'red', 'blue'])

  const rotate = (): void => {
    const [first, ...rest] = colours()
    colours(first === undefined ? [] : [...rest, first])
  }

  return (
    <Panel
      title="Index"
      blurb="For is the right default; this is the answer for the lists it cannot key honestly. ['red','red','blue'] hands two rows the same key, so here the POSITION is the identity and each row receives a getter for whatever occupies its slot."
    >
      <Row gap="sm">
        <Action onTap={rotate}>rotate</Action>
        <Action onTap={() => colours(['red', 'red', 'blue'])}>reset</Action>
      </Row>
      <Index each={colours}>
        {(colour, index) => <Readout>{() => `slot ${index} holds "${colour()}" — the row was never rebuilt`}</Readout>}
      </Index>
    </Panel>
  )
}

/** `<Dynamic>` — the general case `Show` is the two-branch shortcut for. */
const DynamicDemo = (): HostElement => {
  const tab = signal<'summary' | 'detail' | 'none'>('summary')

  const summary = (): HostElement => <Readout>a summary subtree</Readout>
  const detail = (): HostElement => (
    <Stack gap="xs">
      <Readout>a completely different subtree</Readout>
      <Chip tone="good">built fresh on every swap</Chip>
    </Stack>
  )

  return (
    <Panel
      title="Dynamic"
      blurb="Whenever the selected builder changes, the previous subtree is disposed before the next is built — which is what makes it the right primitive for routed screens and tab bodies, where the branch leaving must not keep reacting in the background."
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

/** `<VirtualFor>` — a bounded window of rows, for the collections `For` cannot afford. */
type Contact = { readonly id: number; readonly name: string; readonly city: string }

const CITIES = ['Lisbon', 'Osaka', 'Toronto', 'Nairobi', 'Bergen'] as const

/** Ten thousand rows, built once. A device would create ten thousand real views for these under `For`. */
const CONTACTS: readonly Contact[] = Array.from({ length: 10_000 }, (_, index) => ({
  id: index,
  name: `contact ${index.toString().padStart(4, '0')}`,
  city: CITIES[index % CITIES.length] as string,
}))

const ROW_HEIGHT = 44
const VIEWPORT = 220

const VirtualForDemo = (): HostElement => {
  const palette = PaletteContext.use()
  // Counts how many row elements have ever been BUILT. `For` over the same data
  // would make ten thousand of them; this settles at the window size and stays
  // there however far the list is scrolled.
  //
  // A plain counter mirrored into the signal, for the same reason `list` below
  // needs one: the builder runs inside the list's own tracking effect, so
  // reading `built()` in there would make the list depend on a signal it writes
  // and the effect would re-run itself forever.
  let rows = 0
  const built = signal(0)

  return (
    <Panel
      title="VirtualFor"
      blurb="On the web ten thousand nodes is slow; on a device it is ten thousand real views, which is the defining native performance problem and the reason every native toolkit ships a recycler. This builds viewport / itemSize + 2 × overscan elements and no more."
    >
      <VirtualFor
        each={CONTACTS}
        itemSize={ROW_HEIGHT}
        viewport={VIEWPORT}
        overscan={2}
        role="list"
        label="Contacts"
        style={() => ({
          borderRadius: RADIUS.sm,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: palette().border,
          background: palette().surfaceAlt,
        })}
      >
        {(contact) => {
          rows += 1
          built(rows)
          return (
            <view
              role="listitem"
              style={() => ({
                height: ROW_HEIGHT,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingLeft: 10,
                paddingRight: 10,
              })}
            >
              {/* Both arguments are GETTERS, and reading them inside a binding is
                  the whole design: the node stays put and the data flows through
                  it, exactly as a native recycler reuses a cell. */}
              <text style={() => ({ color: palette().text, fontSize: 13 })}>{() => contact().name}</text>
              <text style={() => ({ color: palette().muted, fontSize: 12 })}>{() => contact().city}</text>
            </view>
          )
        }}
      </VirtualFor>
      <Readout>
        {() => `${CONTACTS.length.toLocaleString()} rows in the collection · ${built()} row elements ever built`}
      </Readout>
      <Text size="sm" tone="muted">
        `itemSize` is fixed, and that is the notable limitation: rows of differing heights need each one measured before
        it is on screen, which needs a `measure` on the host contract that does not exist. Estimating instead is how a
        virtualised list ends up jumping under the user's finger as the estimates are corrected — a wrong fixed number
        is at least wrong visibly.
      </Text>
      <Text size="sm" tone="muted">
        It is not bound to a platform recycler, and Lynx has one. A recycler's model is “the engine owns the cell, you
        fill it with data” — which is a different contract from the rest of the package, and unnecessary, because
        `Index` already hands a row a getter for whatever occupies its slot. Same idea, so the window is built out of
        the ordinary keyed list and behaves identically on all three targets.
      </Text>
    </Panel>
  )
}

/** `list()` — the reconciler underneath `For` and `Index`. */
const ListDemo = (): HostElement => {
  const palette = PaletteContext.use()
  const rows = signal<readonly string[]>(['alpha', 'beta', 'gamma'])
  const live = signal(0)
  const total = computed(() => rows().length)

  // A plain counter mirrored into the signal: `create` runs inside the list's
  // own tracking effect, so reading `live()` in there would make the list depend
  // on a signal it writes and the effect would re-run itself forever.
  let scopes = 0
  const countScopes = (delta: number): void => {
    scopes += delta
    live(scopes)
  }

  let next = 1

  return (
    <Panel
      title="list"
      blurb="The only reconciler in the package, and the one place nodes are created, moved and destroyed. Each row opens its own scope; the live counter is incremented on create and decremented from the row's onCleanup, so it reads out exactly how many the list is holding."
    >
      <Row gap="sm">
        <Action onTap={() => rows([`row ${next++}`, ...rows()])}>add</Action>
        <Action onTap={() => rows(rows().slice(1))}>drop first</Action>
        <Action onTap={() => rows([])}>clear</Action>
      </Row>
      <view
        ref={(container) => {
          // The container belongs to the list and nothing else may insert into
          // it — that ownership is what lets the reconciler treat child order as
          // its own bookkeeping.
          list(
            container,
            rows,
            (row) => row,
            (row) => {
              countScopes(1)
              onCleanup(() => countScopes(-1))
              return (
                <text
                  style={() => ({
                    padding: 8,
                    marginBottom: 4,
                    borderRadius: RADIUS.sm,
                    background: palette().surfaceAlt,
                    color: palette().text,
                    fontSize: 14,
                  })}
                >
                  {row}
                </text>
              )
            },
          )
        }}
      />
      <Readout>{() => `rows: ${total()} · live scopes: ${live()}`}</Readout>
    </Panel>
  )
}
