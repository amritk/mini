import { signal } from '@amritk/mini'
import { For, Show } from '@amritk/mini/flow'
import { createQuery } from '@amritk/mini/query'
import { QueryClient } from '@tanstack/query-core'

import { fetchRepos, OWNERS, type Repo } from '../lib/demo-api'
import { Out, Page, Section } from '../lib/ui'

/**
 * `@amritk/mini/query` — roughly sixty lines that forward a `@tanstack/query-core`
 * observer into signals. Caching, deduplication, retries and invalidation are
 * query-core's; mini contributes the signals and the `onCleanup` that
 * unsubscribes.
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

export const QueryPage = (): HTMLElement => (
  <Page
    title="Async data"
    lede="createQuery(client, options) subscribes a QueryObserver and exposes its result as signals. Options may be a getter, which is what makes the query key reactive — change the owner and the query refetches under the new key."
  >
    <Basics />
    <Sharing />
  </Page>
)

/** One query, a reactive key, and every state it can be in. */
const Basics = (): HTMLElement => {
  const owner = signal<string>('amritk')

  // The options are a GETTER, so `owner` is tracked: writing it swaps the query
  // key and re-seeds the optimistic result in the same tick.
  const repos = createQuery<readonly Repo[], Error>(client, () => ({
    queryKey: ['repos', owner()],
    queryFn: () => fetchRepos(owner()),
  }))

  return (
    <Section
      title="createQuery"
      blurb="nobody always fails (and retries once), empty resolves to zero rows and shows the For fallback, and the other two are cached for five seconds — switch back and forth to watch a cached key render instantly."
    >
      <div class="stack">
        <div class="row">
          <For each={OWNERS}>
            {(name) => (
              <button type="button" class={() => (owner() === name ? 'primary' : '')} onClick={() => owner(name)}>
                {name}
              </button>
            )}
          </For>
        </div>

        <div class="row">
          <button type="button" onClick={() => void repos.refetch()}>
            refetch
          </button>
          <button type="button" onClick={() => void client.invalidateQueries({ queryKey: ['repos'] })}>
            invalidate all
          </button>
          <span class="pill">{() => `status: ${repos.status()}`}</span>
          <span class="pill" show={repos.isFetching}>
            fetching…
          </span>
        </div>

        <For
          each={() => repos.data() ?? []}
          key={(repo) => repo.name}
          as="ul"
          class="list"
          fallback={() => <div class="muted">no repositories to show</div>}
        >
          {(repo) => (
            <li>
              <span>{repo.name}</span>
              <span class="muted">
                {repo.language} · {String(repo.stars)}★
              </span>
            </li>
          )}
        </For>

        <div class="out" show={repos.isError}>
          {() => `error: ${repos.error()?.message ?? ''}`}
        </div>

        <Out>
          {() =>
            [
              `status:     ${repos.status()}`,
              `isPending:  ${repos.isPending()}`,
              `isLoading:  ${repos.isLoading()}`,
              `isFetching: ${repos.isFetching()}`,
              `rows:       ${repos.data()?.length ?? '—'}`,
            ].join('\n')
          }
        </Out>
      </div>
    </Section>
  )
}

/** Two observers, one key — the cache is the shared state, not a store. */
const Sharing = (): HTMLElement => {
  const shown = signal(true)

  const Watcher = (props: { readonly tag: string }): HTMLElement => {
    const repos = createQuery<readonly Repo[], Error>(client, () => ({
      queryKey: ['repos', 'amritk'],
      queryFn: () => fetchRepos('amritk'),
    }))
    return (
      <div class="out">
        {() => `${props.tag}: ${repos.status()} · ${repos.data()?.length ?? 0} rows · fetching=${repos.isFetching()}`}
      </div>
    )
  }

  return (
    <Section
      title="Deduplication and teardown"
      blurb="Both readouts subscribe to the same key and share one in-flight request. Each observer is unsubscribed through onCleanup, so hiding the second one really does detach it — query-core then garbage-collects the entry once the last observer is gone."
    >
      <div class="stack">
        <button type="button" onClick={() => shown(!shown())}>
          {() => (shown() ? 'unmount the second watcher' : 'mount it')}
        </button>
        <Watcher tag="watcher A" />
        {/* `Show` disposes the branch it removes, which is what makes the
            observer detach — `show` would only hide it and keep it subscribed. */}
        <Show when={shown}>{() => <Watcher tag="watcher B" />}</Show>
      </div>
    </Section>
  )
}
