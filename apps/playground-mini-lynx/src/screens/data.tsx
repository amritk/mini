import { type LynxElement, signal } from '@amritk/mini-lynx'
import { For, Match, Show, Switch } from '@amritk/mini-lynx/flow'
import { createQuery } from '@amritk/mini-lynx/query'
import { QueryClient } from '@tanstack/query-core'

import { Action, Chip, Panel, Prose, Readout, Row, Stack, TextLine } from '../components'
import { fetchPackages, type Package, SCOPES } from '../lib/demo-api'

/**
 * `/data` — `@amritk/mini-lynx/query`, a verbatim port of the web package's
 * adapter, and its being verbatim is the point.
 *
 * Caching, deduplication, retries and invalidation are `@tanstack/query-core`'s;
 * this package contributes signals and the `onCleanup` that unsubscribes.
 * Nothing in the layer touches an element, which is why it crossed over to a
 * Lynx-only runtime without a line changing — where `/forms` needed one file
 * written twice, because a form eventually has to touch a control.
 */
const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5_000,
      gcTime: 30_000,
    },
  },
})

export const DataScreen = (): LynxElement => (
  <Stack gap="md">
    <Prose>
      The network is the one thing a native app has more of rather than less: a device roams between cells, sleeps
      mid-request and comes back to a stale screen. That is an argument for reusing a serious cache rather than
      hand-rolling a resource primitive, which is what this subpath is — about sixty lines forwarding an observer into
      signals.
    </Prose>
    <Basics />
    <Sharing />
    <Invalidation />
    <MainThread />
  </Stack>
)

/** One query, a reactive key, and every state it can be in. */
const Basics = (): LynxElement => {
  const scope = signal<string>('amritk')

  // The options are a GETTER, so `scope` is tracked: writing it swaps the query
  // key and re-seeds the result in the same tick, with no refetch call anywhere.
  const packages = createQuery<readonly Package[], Error>(client, () => ({
    queryKey: ['packages', scope()],
    queryFn: () => fetchPackages(scope()),
  }))

  return (
    <Panel
      title="createQuery"
      blurb="`nobody` always fails and retries once, `empty` resolves to zero rows, and the other two stay cached for five seconds — switch back and forth to watch a warm key render with no spinner at all."
    >
      <Row gap="xs" wrap>
        <For each={SCOPES}>
          {(name) => (
            <Action onTap={() => scope(name)} disabled={() => scope() === name}>
              {name}
            </Action>
          )}
        </For>
      </Row>

      <Switch>
        <Match when={packages.isPending}>{() => <Chip>loading…</Chip>}</Match>
        <Match when={packages.isError}>
          {() => (
            <Stack gap="sm">
              <Chip tone="bad">{() => packages.error()?.message ?? 'failed'}</Chip>
              <Action onTap={() => void packages.refetch()}>refetch</Action>
            </Stack>
          )}
        </Match>
        <Match when={packages.isSuccess}>{() => <Rows packages={packages.data} />}</Match>
      </Switch>

      <Readout>
        {() =>
          [
            `status:     ${packages.status()}`,
            `isPending:  ${packages.isPending()}   isLoading:  ${packages.isLoading()}`,
            `isFetching: ${packages.isFetching()}   isSuccess:  ${packages.isSuccess()}`,
            `rows:       ${packages.data()?.length ?? '—'}`,
          ].join('\n')
        }
      </Readout>

      <Prose>
        `isFetching` stays true during a background refetch while `data` still holds the previous rows — which is what
        lets a screen show stale content and a quiet spinner rather than tearing itself down and flashing a skeleton.
        Every field above is its own `computed` over one result signal, so a binding that reads `data` does not re-run
        when only `isFetching` changed.
      </Prose>
    </Panel>
  )
}

type RowsProps = {
  /** The signal, uncalled: a `For` over `data()` would freeze at the first result. */
  packages: () => readonly Package[] | undefined
}

/** The rows themselves, keyed by name so a refetch reuses the elements it already built. */
const Rows = (props: RowsProps): LynxElement => {
  const rows = (): readonly Package[] => props.packages() ?? []

  return (
    <Stack gap="xs">
      <Show when={() => rows().length === 0}>
        {() => <TextLine class="card-meta">no packages in this scope</TextLine>}
      </Show>
      <For each={rows} key={(entry) => entry.name} as="view" class="gap-xs" accessibility-label="Packages">
        {(entry) => (
          <view class="card row" style={{ justifyContent: 'space-between' }}>
            <view>
              <TextLine>{entry.name}</TextLine>
              <TextLine class="card-meta">{entry.target}</TextLine>
            </view>
            <TextLine class="card-meta">{`${entry.downloads.toLocaleString()} ↓`}</TextLine>
          </view>
        )}
      </For>
    </Stack>
  )
}

/** Two components, one key — and therefore one request. */
const Sharing = (): LynxElement => {
  const mounted = signal(false)

  return (
    <Panel
      title="One key, one request"
      blurb="Deduplication belongs to the cache rather than to this package. Two components asking for the same key subscribe to one observer and one in-flight request — which matters more on a device, where the duplicate would be a second radio wake-up rather than a second socket."
    >
      <Action onTap={() => mounted(!mounted())}>
        {() => (mounted() ? 'unmount the second reader' : 'mount a second reader')}
      </Action>
      <Reader name="reader A" />
      <Show when={mounted}>{() => <Reader name="reader B" />}</Show>

      <Prose>
        Mounting the second reader shows the cached rows immediately, because the key is already warm and nothing is
        fetched. Both subscriptions are released by `onCleanup` when their scope goes away, which is why unmounting one
        does not disturb the other — and why `createQuery` has to be called inside a component rather than at module
        scope.
      </Prose>
    </Panel>
  )
}

type ReaderProps = {
  readonly name: string
}

/** One subscriber to the shared key, reporting what it can see. */
const Reader = (props: ReaderProps): LynxElement => {
  const packages = createQuery<readonly Package[], Error>(client, () => ({
    queryKey: ['packages', 'amritk'],
    queryFn: () => fetchPackages('amritk'),
  }))

  return (
    <Readout>
      {() => `${props.name}: ${packages.isFetching() ? 'fetching…' : `${packages.data()?.length ?? 0} rows`}`}
    </Readout>
  )
}

/** The client stays yours, which is what keeps the API surface this small. */
const Invalidation = (): LynxElement => (
  <Panel
    title="Invalidation"
    blurb="createQuery returns signals and nothing else. The QueryClient stays yours, so invalidating, prefetching and writing optimistically are plain query-core calls rather than a second API this package would have to keep in step with it."
  >
    <Row gap="sm" wrap>
      <Action onTap={() => void client.invalidateQueries({ queryKey: ['packages'] })}>invalidate every scope</Action>
      <Action onTap={() => client.clear()}>clear the cache</Action>
    </Row>

    <Readout>
      {[
        'const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } })',
        '',
        'const packages = createQuery(client, () => ({',
        "  queryKey: ['packages', scope()],      // a getter, so the key is reactive",
        '  queryFn: () => fetchPackages(scope()),',
        '}))',
      ].join('\n')}
    </Readout>

    <Prose>
      Invalidating marks the cached entries stale and refetches the ones something is still subscribed to, so the panel
      above reloads while the panels nobody is watching simply wait until they are next read.
    </Prose>
  </Panel>
)

/**
 * The one thing that genuinely changed for this layer, and it is not in the
 * layer.
 *
 * Worth its own panel rather than a footnote: nothing in `/query` had to be
 * rewritten, and yet the environment it runs in is different in a way an app has
 * to plan for.
 */
const MainThread = (): LynxElement => (
  <Panel
    title="Where the fetching happens"
    blurb="This runtime drives Lynx's Element PAPI directly, and the PAPI is a main-thread API — so the runtime, and everything it calls, runs on the main thread. That is mostly a gift, and for this subpath it is the one place it asks a question back."
  >
    <Prose>
      `/query` wants `fetch` and it wants timers. On the background thread both are ordinary; on the main thread their
      availability is a question about which engine version an app is running rather than something to assume. It is
      worth checking once, at boot, for the engine you actually ship on — and the check is cheap, because the answer is
      just whether the globals are there.
    </Prose>
    <Prose>
      When they are not, nothing about this layer needs replacing. Fetching moves to the background thread, where an app
      already has a full platform context, and the results are pushed into signals on the main thread — at which point
      every binding on this screen works exactly as it does now, because a signal does not care who wrote it. The same
      applies to a `QueryClient` an app chooses to own on the background thread for its own reasons.
    </Prose>
    <Readout>
      {[
        '// main thread, at boot — an engine-version question, asked once',
        "const canFetchHere = typeof fetch === 'function' && typeof setTimeout === 'function'",
        '',
        '// when it cannot: own the request where the platform is complete,',
        '// and let a signal carry the answer back',
        'const packages = signal<readonly Package[]>([])',
        'onBackgroundResult((rows) => packages(rows))',
      ].join('\n')}
    </Readout>
    <Prose>
      The related rule is the one that costs nothing to follow and everything to discover late: heavy work in a handler
      blocks rendering, because there is no background thread absorbing it here. Parsing a large response belongs behind
      an async boundary — which, for anything reaching this subpath, it already is.
    </Prose>
  </Panel>
)
