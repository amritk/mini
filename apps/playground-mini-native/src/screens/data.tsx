import { type HostElement, signal } from '@amritk/mini-native'
import { For, Match, Show, Switch } from '@amritk/mini-native/flow'
import { createQuery } from '@amritk/mini-native/query'
import { Row, Stack, Text } from '@amritk/mini-native/ui'
import { QueryClient } from '@tanstack/query-core'

import { fetchPackages, type Package, SCOPES } from '../lib/demo-api'
import { Action, Chip, Panel, Readout } from '../lib/ui'
import { PaletteContext, RADIUS } from '../theme'

/**
 * `@amritk/mini-native/query` — a verbatim port of the web package's adapter,
 * and the port being verbatim is the point.
 *
 * Caching, deduplication, retries and invalidation are `@tanstack/query-core`'s;
 * this package contributes signals and the `onCleanup` that unsubscribes. None
 * of that touches an element, so unlike `/forms` — where the file that wires a
 * control to a field had to be rewritten — the whole layer crossed over
 * untouched and this screen would render the same on a device.
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

export const DataScreen = (): HostElement => (
  <Stack gap="md">
    <Text tone="muted" size="sm">
      The network is the one thing a native app has more of, not less: a device roams between cells, sleeps mid-request
      and comes back to a stale screen. That is an argument for reusing a serious cache rather than hand-rolling a
      resource primitive, which is what this subpath is — about sixty lines forwarding an observer into signals.
    </Text>
    <Basics />
    <Sharing />
    <Lifecycle />
  </Stack>
)

/** One query, a reactive key, and every state it can be in. */
const Basics = (): HostElement => {
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
      <Row gap="xs">
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
            `isFetching: ${packages.isFetching()}`,
            `rows:       ${packages.data()?.length ?? '—'}`,
          ].join('\n')
        }
      </Readout>
      <Text size="sm" tone="muted">
        `isFetching` stays true during a background refetch while `data` still holds the previous rows — which is what
        lets a screen show stale content and a quiet spinner rather than tearing itself down and flashing a skeleton.
      </Text>
    </Panel>
  )
}

type RowsProps = {
  /** The signal, uncalled: a `For` over `data()` would freeze at the first result. */
  packages: () => readonly Package[] | undefined
}

/**
 * The rows themselves.
 *
 * `as="view"` with `role="list"` rather than a `<view role="list">` wrapped
 * around a bare `For`: the default flow wrapper is deliberately invisible to
 * assistive technology, so it would sit between the list and its items and break
 * the relationship. Both props together are how an accessible collection is
 * written here.
 */
const Rows = (props: RowsProps): HostElement => {
  const palette = PaletteContext.use()
  const rows = (): readonly Package[] => props.packages() ?? []

  return (
    <Stack gap="xs">
      <Show when={() => rows().length === 0}>{() => <Text tone="muted">no packages in this scope</Text>}</Show>
      <For each={rows} key={(entry) => entry.name} as="view" role="list" label="Packages" style={{ gap: 6 }}>
        {(entry) => (
          <view
            role="listitem"
            style={() => ({
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 10,
              borderRadius: RADIUS.sm,
              background: palette().surfaceAlt,
            })}
          >
            <Stack>
              <text style={() => ({ color: palette().text, fontSize: 14 })}>{entry.name}</text>
              <text style={() => ({ color: palette().muted, fontSize: 12 })}>{entry.target}</text>
            </Stack>
            <text style={() => ({ color: palette().muted, fontSize: 13 })}>
              {`${entry.downloads.toLocaleString()} ↓`}
            </text>
          </view>
        )}
      </For>
    </Stack>
  )
}

/** Two components, one key — and therefore one request. */
const Sharing = (): HostElement => {
  const mounted = signal(false)

  const Watcher = (props: { readonly name: string }): HostElement => {
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

  return (
    <Panel
      title="One key, one request"
      blurb="Deduplication is the cache's, not this package's. Two components asking for the same key subscribe to one observer and one in-flight request — which matters more on a device, where the duplicate would be a second radio wake-up rather than a second socket."
    >
      <Action onTap={() => mounted(!mounted())}>
        {() => (mounted() ? 'unmount the second reader' : 'mount a second reader')}
      </Action>
      <Watcher name="reader A" />
      <Show when={mounted}>{() => <Watcher name="reader B" />}</Show>
      <Text size="sm" tone="muted">
        Mounting the second reader shows the cached rows immediately — the key is already warm, so nothing is fetched.
        Both subscriptions are released by `onCleanup` when their scope goes away, which is why unmounting one does not
        disturb the other.
      </Text>
    </Panel>
  )
}

/** The invalidation button, and the thing an app forgets until it is on a device. */
const Lifecycle = (): HostElement => (
  <Panel
    title="Invalidation"
    blurb="`createQuery` returns signals and nothing else — the client stays yours, so invalidation, prefetching and optimistic writes are plain query-core calls rather than a second API this package would have to keep in sync."
  >
    <Row gap="sm">
      <Action onTap={() => void client.invalidateQueries({ queryKey: ['packages'] })}>invalidate every scope</Action>
      <Action onTap={() => client.clear()}>clear the cache</Action>
    </Row>
    <Readout>
      {[
        'const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 } } })',
        '',
        'const packages = createQuery(client, () => ({',
        "  queryKey: ['packages', scope()],   // a getter, so the key is reactive",
        '  queryFn: () => fetchPackages(scope()),',
        '}))',
      ].join('\n')}
    </Readout>
    <Text size="sm" tone="muted">
      `@tanstack/query-core` is an optional peer: the `.` entry never touches it, and only an app that imports `/query`
      needs it installed. That is the same rule every subpath here follows — a feature only some apps need pays for
      itself only in the apps that use it.
    </Text>
  </Panel>
)
