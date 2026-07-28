import { bindValue, computed, signal } from '@amritk/mini'
import { Show } from '@amritk/mini/flow'
import { Link, matchRoute, type Route, type Router } from '@amritk/mini/router'

import { Out, Page, Section } from '../lib/ui'

/**
 * `@amritk/mini/router` — the router this playground itself runs on. It is
 * prop-drilled rather than ambient: `<Link>` takes `navigate` as a prop,
 * matching mini's charter of explicit composition over a runtime registry.
 */
export type RouterPageProps = {
  /** The app's router, passed down from the shell — there is no ambient context to read. */
  router: Router<Route>
}

export const RouterPage = (props: RouterPageProps): HTMLElement => (
  <Page
    title="Routing"
    lede="createRouter matches the URL against a route table into a reactive route signal. This page is itself a route, the address bar is real, and Cloudflare is configured to serve index.html for unknown paths so a reload of /forms works."
  >
    <LiveState router={props.router} />
    <Params router={props.router} />
    <Navigation router={props.router} />
    <Matching />
  </Page>
)

/** Everything the router exposes, as it changes. */
const LiveState = (props: RouterPageProps): HTMLElement => {
  const { router } = props

  return (
    <Section
      title="route()"
      blurb="One signal carrying the normalised path, the raw search string, the parsed query, the captured params, and the matched route definition (or null, which is your 404)."
    >
      <div class="stack">
        <div class="row">
          <Link to="/router?tab=state&page=2" navigate={router.navigate} class="pill">
            ?tab=state&amp;page=2
          </Link>
          <Link to="/router?tab=params" navigate={router.navigate} class="pill">
            ?tab=params
          </Link>
          <Link to="/router" navigate={router.navigate} class="pill">
            no query
          </Link>
        </div>
        <Out>
          {() => {
            const state = router.route()
            return [
              `path:   ${state.path}`,
              `search: ${state.search || '(none)'}`,
              `query:  ${JSON.stringify(state.query)}`,
              `params: ${JSON.stringify(state.params)}`,
              `route:  ${state.route?.path ?? 'null — nothing matched'}`,
            ].join('\n')
          }}
        </Out>
      </div>
    </Section>
  )
}

/** Params, and the thing that surprises people: the same route is not rebuilt. */
const Params = (props: RouterPageProps): HTMLElement => {
  const { router } = props
  const owner = computed(() => router.route().params['owner'])
  const repo = computed(() => router.route().params['repo'])

  return (
    <Section
      title="Params"
      blurb="These links all match /router/:owner/:repo, so navigating between them keeps this page mounted and only updates the params. Anything living in the subtree — a scroll position, a focused field, an in-flight request — survives."
    >
      <div class="stack">
        <div class="row">
          <Link to="/router/amritk/mini" navigate={router.navigate} class="pill">
            amritk/mini
          </Link>
          <Link to="/router/amritk/mini-lynx" navigate={router.navigate} class="pill">
            amritk/mini-lynx
          </Link>
          <Link to="/router" navigate={router.navigate} class="pill">
            clear
          </Link>
        </div>
        <Show when={owner} fallback={() => <div class="muted">no params captured — follow one of the links above</div>}>
          {(value) => <div class="out">{() => `owner = ${value()}\nrepo  = ${repo() ?? '(none)'}`}</div>}
        </Show>
      </div>
    </Section>
  )
}

/** `navigate`, `replace`, and what `<Link>` does that a bare `<a>` does not. */
const Navigation = (props: RouterPageProps): HTMLElement => {
  const { router } = props

  return (
    <Section
      title="navigate and Link"
      blurb="<Link> renders a real anchor with a real href — middle-click, cmd-click and 'copy link address' all keep working — and intercepts only the plain left-click, where it calls navigate instead of letting the browser reload the page."
    >
      <div class="stack">
        <div class="row">
          <button type="button" onClick={() => router.navigate('/query')}>
            navigate('/query')
          </button>
          <button type="button" onClick={() => router.navigate('/router', { replace: true })}>
            navigate('/router', {'{'} replace: true {'}'})
          </button>
          <button type="button" onClick={() => history.back()}>
            history.back()
          </button>
        </div>
        <p class="muted">
          <code>replace</code> swaps the current history entry instead of stacking a new one, so the back button skips
          it — press back after each of the two buttons above and compare.
        </p>
        <div class="row">
          <Link
            to="/lists"
            navigate={router.navigate}
            class="pill"
            active={() => router.route().path === '/lists'}
            activeClass="good"
          >
            a link that knows when it is active
          </Link>
        </div>
      </div>
    </Section>
  )
}

/** `matchRoute` — the pure half, with no browser anywhere near it. */
const PATTERNS = ['/', '/repos/:owner', '/repos/:owner/:repo', '/files/*'] as const

const Matching = (): HTMLElement => {
  const path = signal('/repos/amritk/mini')

  const results = computed(() =>
    PATTERNS.map((pattern) => {
      const params = matchRoute(pattern, path())
      return `${pattern.padEnd(22)} ${params ? `✓ ${JSON.stringify(params)}` : '·'}`
    }).join('\n'),
  )

  return (
    <Section
      title="matchRoute"
      blurb="Pattern matching is string arithmetic with no platform in it — the same function backs mini-lynx's router, where there is no address bar to read. Type a path and watch which patterns claim it."
    >
      <div class="stack">
        <input ref={(element) => bindValue(element, path)} />
        <Out>{results}</Out>
      </div>
    </Section>
  )
}
