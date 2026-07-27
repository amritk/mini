import { computed, type HostElement, signal, watch } from '@amritk/mini-native'
import { Show } from '@amritk/mini-native/flow'
import { createMemoryHistory, createRouter, matchRoute, RouteLink } from '@amritk/mini-native/router'
import { Row, Stack, Text } from '@amritk/mini-native/ui'

import { Action, Chip, Panel, Readout } from '../lib/ui'
import { type AppRouter, router } from '../routes'

/**
 * `@amritk/mini-native/router` — matching is arithmetic and is written once;
 * moving between locations is not, so it goes through a pluggable
 * `RouterHistory`. That split is the whole design, and it is what lets the same
 * router run against a browser's session history here and against an in-memory
 * stack on a device or in a test.
 */
export type RoutingScreenProps = {
  /**
   * The matched route's params, as a GETTER — the shape `RouteView` hands every
   * screen. A plain object would be the params as they were when the screen was
   * built, which is exactly the state this screen exists to disprove.
   */
  params: () => Record<string, string>
}

export const RoutingScreen = (props: RoutingScreenProps): HostElement => (
  <Stack gap="md">
    <Text tone="muted" size="sm">
      This app runs on the router. The address bar is real — Cloudflare serves index.html for unknown paths, so a hard
      reload of /gestures works — and the browser back button drives the same signal the tab bar does.
    </Text>
    <LiveState router={router} />
    <Params router={router} params={props.params} />
    <Navigation router={router} />
    <MemoryHistory />
    <Matching />
  </Stack>
)

export type RouterPanelProps = {
  /** Passed explicitly rather than pulled from a context, so this stays a plain component. */
  router: AppRouter
}

/** Everything `route()` carries, live. */
const LiveState = (props: RouterPanelProps): HostElement => (
  <Panel
    title="route()"
    blurb="One signal carrying the path, the raw search string, the parsed query, the captured params, and the matched route definition — or null, which is your 404."
  >
    <Row gap="xs">
      <RouteLink to="/routing?tab=state&page=2" navigate={props.router.navigate}>
        <Chip>?tab=state&amp;page=2</Chip>
      </RouteLink>
      <RouteLink to="/routing" navigate={props.router.navigate}>
        <Chip>no query</Chip>
      </RouteLink>
    </Row>
    <Readout>
      {() => {
        const state = props.router.route()
        return [
          `path:   ${state.path}`,
          `search: ${state.search || '(none)'}`,
          `query:  ${JSON.stringify(state.query)}`,
          `params: ${JSON.stringify(state.params)}`,
          `route:  ${state.route?.path ?? 'null — nothing matched'}`,
        ].join('\n')
      }}
    </Readout>
  </Panel>
)

/** Params, and the screen that is deliberately NOT rebuilt. */
const Params = (props: RouterPanelProps & RoutingScreenProps): HostElement => {
  const owner = computed(() => props.params()['owner'])
  const builtAt = new Date().toLocaleTimeString()

  return (
    <Panel
      title="Params"
      blurb="/routing/:owner keeps this screen mounted and only updates params() — so a scroll position, a focused field and any in-flight request inside it all survive. A different route swaps the subtree instead."
    >
      <Row gap="xs">
        <RouteLink to="/routing/amritk" navigate={props.router.navigate}>
          <Chip>amritk</Chip>
        </RouteLink>
        <RouteLink to="/routing/acme" navigate={props.router.navigate}>
          <Chip>acme</Chip>
        </RouteLink>
        <RouteLink to="/routing" navigate={props.router.navigate}>
          <Chip>clear</Chip>
        </RouteLink>
      </Row>
      <Show when={owner} fallback={() => <Text tone="muted">no params — follow one of the links above</Text>}>
        {(value) => <Readout>{() => `owner = ${value()}`}</Readout>}
      </Show>
      <Readout>{`this screen was built at ${builtAt} and has not been rebuilt since`}</Readout>
    </Panel>
  )
}

/** `navigate`, `replace`, `back`, and the `canGoBack` signal that gates the last one. */
const Navigation = (props: RouterPanelProps): HostElement => {
  const log = signal<readonly string[]>([])

  // Only `route` is tracked, and the callback runs outside the tracking scope —
  // which is what makes "do something when the route changes" expressible
  // without it firing once during setup.
  watch(
    () => props.router.route().path,
    (next, previous) => log([`${previous} → ${next}`, ...log()].slice(0, 5)),
  )

  return (
    <Panel
      title="navigate · back · canGoBack"
      blurb="canGoBack is a signal, so a back control can be shown only where it would do something. It counts the entries THIS router pushed rather than the browser's history length — which counts every page the tab has ever visited and therefore cannot answer the only question a back chevron asks."
    >
      <Row gap="sm">
        <Action onTap={() => props.router.navigate('/gestures')}>navigate('/gestures')</Action>
        <Action onTap={() => props.router.navigate('/routing', { replace: true })}>replace</Action>
        <Action onTap={() => props.router.back()} disabled={() => !props.router.canGoBack()}>
          back
        </Action>
      </Row>
      <Chip tone={() => (props.router.canGoBack() ? 'good' : 'neutral')}>
        {() => `canGoBack: ${props.router.canGoBack()}`}
      </Chip>
      <Readout>{() => (log().length === 0 ? '(no navigation yet)' : log().join('\n'))}</Readout>
      <Text size="sm" tone="muted">
        `replace` swaps the current entry instead of stacking on it — press the browser's back button after each of the
        first two buttons and compare.
      </Text>
    </Panel>
  )
}

/** The same router, driven by the platform-free history — a device, or a test. */
const MemoryHistory = (): HostElement => {
  const history = createMemoryHistory()
  // A route's `view` is required, so these build something real — the panel
  // below just reads the matched definition rather than rendering it, which is
  // the point: the router is data first and a renderer second.
  const local = createRouter({
    history,
    routes: [
      { path: '/', label: 'home', view: () => <Readout>home</Readout> },
      { path: '/settings', label: 'settings', view: () => <Readout>settings</Readout> },
      {
        path: '/users/:id',
        label: 'a user',
        view: (params: () => Record<string, string>) => <Readout>{() => `user ${params()['id']}`}</Readout>,
      },
    ],
  })

  return (
    <Panel
      title="createMemoryHistory"
      blurb="A second router in the same app, with no browser under it at all. This is the right shape for a device — where the app owns its navigation stack outright and there is nothing the user can type into — and it is also the shape a test wants."
    >
      <Row gap="xs">
        <Action onTap={() => local.navigate('/')}>/</Action>
        <Action onTap={() => local.navigate('/settings')}>/settings</Action>
        <Action onTap={() => local.navigate('/users/42')}>/users/42</Action>
        <Action onTap={() => local.back()} disabled={() => !local.canGoBack()}>
          back
        </Action>
      </Row>
      <Readout>
        {() =>
          [
            `path:   ${local.route().path}`,
            `params: ${JSON.stringify(local.route().params)}`,
            `label:  ${String(local.route().route?.['label'] ?? '—')}`,
            `canGoBack: ${local.canGoBack()}`,
          ].join('\n')
        }
      </Readout>
      <Text size="sm" tone="muted">
        Nothing above changed the address bar. The two routers are independent because the history is a parameter rather
        than an assumption.
      </Text>
    </Panel>
  )
}

/** `matchRoute` — the pure half, shared verbatim with `@amritk/mini`'s router. */
const PATTERNS = ['/', '/users/:id', '/users/:id/posts/:post', '/files/*'] as const

const Matching = (): HostElement => {
  const path = signal('/users/42/posts/7')

  const results = computed(() =>
    PATTERNS.map((pattern) => {
      const params = matchRoute(pattern, path())
      return `${pattern.padEnd(24)} ${params ? `✓ ${JSON.stringify(params)}` : '·'}`
    }).join('\n'),
  )

  return (
    <Panel
      title="matchRoute"
      blurb="String arithmetic with no platform in it — :name captures a segment, a trailing * captures the rest into params.rest, and everything else must match literally. @amritk/mini's router uses the same function for the same reason."
    >
      <input
        value={path}
        label="Path to match"
        onInput={(event) => path(event.value)}
        style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderStyle: 'solid', fontSize: 13 }}
      />
      <Readout>{results}</Readout>
    </Panel>
  )
}
