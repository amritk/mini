import { computed, type LynxElement, signal, watch } from '@amritk/mini-lynx'
import { For, Index, Show } from '@amritk/mini-lynx/flow'
import {
  createMemoryHistory,
  createRouter,
  fadeTransition,
  matchRoute,
  parseQuery,
  RouteLink,
  RouteStack,
} from '@amritk/mini-lynx/router'

import { Action, Chip, Panel, Prose, Readout, Row, TextLine } from '../components'
import { router } from '../routes'

/**
 * `/routing` — matching is arithmetic, and moving between locations is not.
 *
 * That split is the entire design. Matching a pattern against a path is string
 * arithmetic with no platform underneath it, which is why `@amritk/mini` and
 * this package share the same function and therefore agree about what a route
 * pattern means. Navigation is the half with something underneath, so it goes
 * through a `RouterHistory` the app hands in.
 *
 * This screen is mounted under two patterns — `/routing` and `/routing/:owner`
 * — which is what lets it show the one behaviour a router is judged on: when a
 * screen is kept and when it is thrown away.
 */
export type RoutingScreenProps = {
  /**
   * The matched route's params, as a GETTER — the shape `RouteView` hands every
   * screen's `view`. A plain object would be the params as they were when the
   * screen was built, which is exactly the state this screen exists to disprove.
   */
  params: () => Record<string, string>
}

/**
 * How many times this component has been constructed, across the whole session.
 *
 * At module scope on purpose: a counter inside the component would reset with
 * the component, which is the one thing it is here to measure.
 */
let builds = 0

export const RoutingScreen = (props: RoutingScreenProps): LynxElement => {
  builds += 1

  return (
    <view>
      <LiveState />
      <Params params={props.params} build={builds} />
      <Navigation />
      <Query />
      <Matching />
      <Stack />
      <SecondRouter />
      <NoBrowserHistory />
    </view>
  )
}

// ---------------------------------------------------------------------------
// The live router
// ---------------------------------------------------------------------------

/** Everything `route()` carries, in one signal. */
const LiveState = (): LynxElement => (
  <Panel
    title="route()"
    blurb="One signal carrying the path, the raw search string, the parsed query, the captured params, and the matched route definition — or null, which is your not-found screen. Read it inside a binding and everything downstream follows navigation."
  >
    <Row gap="xs">
      <Link to="/routing?tab=state&amp;page=2">?tab=state&amp;page=2</Link>
      <Link to="/routing/amritk">/routing/amritk</Link>
      <Link to="/routing">/routing</Link>
    </Row>
    <Lines>
      {() => {
        const state = router.route()
        return [
          `path    ${state.path}`,
          `search  ${state.search === '' ? '(none)' : state.search}`,
          `query   ${JSON.stringify(state.query)}`,
          `params  ${JSON.stringify(state.params)}`,
          `route   ${state.route?.path ?? 'null — nothing matched'}`,
        ]
      }}
    </Lines>
    <Prose>
      Route metadata is opaque to the router, so the label and badge this app's tab bar reads ride along on each
      definition and the table stays the single source of truth. Nothing had to be registered for that to work.
    </Prose>
  </Panel>
)

/** Params, and the screen that is deliberately not rebuilt when they change. */
const Params = (props: RoutingScreenProps & { build: number }): LynxElement => {
  const owner = computed(() => props.params()['owner'])
  const builtAt = new Date().toLocaleTimeString()

  return (
    <Panel
      title="Params, and what survives"
      blurb="RouteView swaps on the matched ROUTE, not on every change to what it read. Move between the two owners below and the screen is kept while params() reports new values; go back to the bare /routing and the subtree is torn down, because that is a different route definition."
    >
      <Row gap="xs">
        <Link to="/routing/amritk">amritk</Link>
        <Link to="/routing/acme">acme</Link>
        <Link to="/routing/lynx">lynx</Link>
        <Link to="/routing">clear</Link>
      </Row>
      <Show
        when={owner}
        fallback={() => <TextLine class="card-meta">no owner param — follow one of the links</TextLine>}
      >
        {(value) => <Readout>{() => `owner = ${value()}`}</Readout>}
      </Show>
      <Readout>{`this instance was built at ${builtAt} · construction number ${props.build}`}</Readout>
      <Prose>
        That is what a params getter buys. A scroll position, a focused field and any in-flight request inside the
        screen all survive an owner change, because nothing was rebuilt — only the bindings that read params re-ran. It
        falls out of the swap being decided on factory identity, which is why each route gets exactly one factory and
        the router remembers it.
      </Prose>
      <Prose>
        The screen is registered under both patterns, and each registration is its own route definition, so crossing
        between them is a genuine swap. Two patterns that should share one instance want one pattern with an optional
        segment, or one route and a params reader that tolerates the absence.
      </Prose>
    </Panel>
  )
}

/** `navigate`, `replace`, `back`, and the signal that gates the last one. */
const Navigation = (): LynxElement => {
  const log = signal<readonly string[]>([])

  // Only the path is tracked, and the callback runs outside the tracking scope —
  // which is what makes "do something when the route changes" expressible
  // without it also firing once during setup.
  watch(
    () => router.route().path,
    (next, previous) => log([`${previous} → ${next}`, ...log()].slice(0, 6)),
  )

  return (
    <Panel
      title="navigate · replace · back · canGoBack"
      blurb="canGoBack is a signal, so a back control can be shown only where it would do something. It counts the entries THIS router pushed, which is the only question a back chevron actually asks."
    >
      <Row gap="sm">
        <Action onTap={() => router.navigate('/routing/amritk')}>navigate</Action>
        <Action onTap={() => router.navigate('/routing/acme', { replace: true })}>replace</Action>
        <Action onTap={() => router.back()} disabled={() => !router.canGoBack()}>
          back
        </Action>
      </Row>
      <Chip tone={() => (router.canGoBack() ? 'good' : 'neutral')}>{() => `canGoBack: ${router.canGoBack()}`}</Chip>
      <Lines>{() => (log().length === 0 ? ['(no navigation yet)'] : log())}</Lines>
      <Prose>
        replace swaps the current entry instead of stacking on it, which is what a redirect wants and what a step does
        not. Push twice and press back twice; replace twice and press back once.
      </Prose>
      <Prose>
        back is also what a hardware back gesture calls. The memory history notifies its subscribers from back and not
        from push or replace, because those two already went through the router — which knows to refresh — while a
        gesture arrives from outside it entirely.
      </Prose>
    </Panel>
  )
}

/** `parseQuery` — the search string, flattened into something a screen can read. */
const Query = (): LynxElement => (
  <Panel
    title="parseQuery"
    blurb="The search string is parsed once per navigation and handed over as a flat record, so a screen reads route().query.page rather than doing its own string surgery."
  >
    <Row gap="xs">
      <Link to="/routing?page=2&amp;sort=downloads">page and sort</Link>
      <Link to="/routing?q=hello+world">a plus-encoded space</Link>
      <Link to="/routing?flag">a key with no value</Link>
      <Link to="/routing">nothing</Link>
    </Row>
    <Lines>
      {() => {
        const state = router.route()
        const entries = Object.entries(parseQuery(state.search))
        return entries.length === 0
          ? [`search  (none)`]
          : [`search  ${state.search}`, ...entries.map(([key, value]) => `  ${key} = ${JSON.stringify(value)}`)]
      }}
    </Lines>
    <Prose>
      It is written by hand rather than through URLSearchParams, and that is not reinvention. URLSearchParams is a web
      platform global rather than an ECMAScript one, so it is absent from the standard library this package compiles
      against and a native engine is under no obligation to provide it. Using it would put a browser assumption in the
      one part of routing that is otherwise pure.
    </Prose>
  </Panel>
)

/** The patterns tested against the sample paths below. */
const PATTERNS: readonly string[] = ['/', '/routing', '/routing/:owner', '/routing/:owner/repos/:repo', '/files/*']

/** The paths the demo cycles through. */
const SAMPLES: readonly string[] = ['/routing/amritk', '/routing/amritk/repos/mini', '/files/a/b/c.txt', '/nope']

/** `matchRoute` — the pure half, shared verbatim with `@amritk/mini`'s router. */
const Matching = (): LynxElement => {
  const path = signal<string>(SAMPLES[0] as string)

  return (
    <Panel
      title="matchRoute"
      blurb="String arithmetic with no platform in it. A colon captures one segment into params, a trailing star captures the rest into params.rest, and everything else must match literally. Leading and trailing slashes are normalised, and captured segments are decoded."
    >
      <Row gap="xs">
        <For each={SAMPLES}>
          {(sample) => (
            <Action onTap={() => path(sample)} disabled={() => path() === sample}>
              {sample}
            </Action>
          )}
        </For>
      </Row>
      <Lines>
        {() =>
          PATTERNS.map((pattern) => {
            const params = matchRoute(pattern, path())
            return `${pattern.padEnd(30)}${params ? `✓ ${JSON.stringify(params)}` : '·'}`
          })
        }
      </Lines>
      <Prose>
        This is the function the router calls for every route in the table on every navigation, and it is the whole of
        what a route pattern means here. There are deliberately only two pieces of grammar, because those are the two a
        real app reaches for.
      </Prose>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// A second router, with nothing under it
// ---------------------------------------------------------------------------

/** The same router type, driven by its own memory history. */
const SecondRouter = (): LynxElement => {
  const local = createRouter({
    history: createMemoryHistory({ path: '/', search: '' }),
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
      blurb="A second, completely independent router in the same app. The two cannot interfere with each other because the history is a parameter rather than an assumption — which is also what lets an app embedded in a native shell hand that shell's navigation in behind the same interface."
    >
      <Row gap="xs">
        <Action onTap={() => local.navigate('/')}>/</Action>
        <Action onTap={() => local.navigate('/settings')}>/settings</Action>
        <Action onTap={() => local.navigate('/users/42')}>/users/42</Action>
        <Action onTap={() => local.back()} disabled={() => !local.canGoBack()}>
          back
        </Action>
      </Row>
      <Lines>
        {() => [
          `path      ${local.route().path}`,
          `params    ${JSON.stringify(local.route().params)}`,
          `label     ${String(local.route().route?.['label'] ?? '—')}`,
          `canGoBack ${local.canGoBack()}`,
        ]}
      </Lines>
      <Prose>
        Memory history usually means the fake, and here it means the opposite. A Lynx app has no session history shared
        with anything else — it has a stack of screens it owns outright — so an in-memory stack is not a stand-in for
        the real thing, it IS the real thing. That the same object makes routing testable in plain node, with no engine
        at all, is the same property paying twice.
      </Prose>
    </Panel>
  )
}

/** Why the browser history is gone, which is a design statement rather than a gap. */
const NoBrowserHistory = (): LynxElement => (
  <Panel
    title="There is no browser history"
    blurb="An earlier version of this package shipped createBrowserHistory on its own entry point. It went with the DOM host, and it is not coming back."
  >
    <Prose>
      This package targets Lynx. A Lynx app has no URL bar, so there is no address to keep continuously correct, nothing
      for a user to type into, and no shared session history that other pages also push onto. Navigation state lives in
      memory, in a stack the app owns, and that is not a reduced version of the web model — it is what navigation
      actually is on a phone.
    </Prose>
    <Prose>
      Deep links arrive as DATA rather than as a location. The platform hands the app a path, the app calls navigate,
      and the router matches it exactly as it would any other navigation. A hardware back gesture is wired the same way:
      call back on the history, and the route signal updates like any other change.
    </Prose>
    <Prose>
      The visible cost is right here in this preview: the address bar does not move, and reloading the page returns you
      to the first screen. That is the honest trade rather than a bug. A preview that grew an affordance the real target
      does not have would be teaching the wrong thing, which is the same argument that removed the DOM host in the first
      place.
    </Prose>
    <Prose>
      Two things are also deliberately missing above this layer. A rendered navigation STACK — a second screen sliding
      over the first with both alive at once — needs an animation seam that does not exist yet; RouteView is the
      single-slot version, which is what a tab's root wants. And guards and lazy routes are both expressible today, a
      guard as a replace inside a watch on route() and a lazy route as a view that renders a placeholder until its
      import lands, so neither has earned an API before a real app has asked twice.
    </Prose>
  </Panel>
)

// ---------------------------------------------------------------------------
// The navigation stack
// ---------------------------------------------------------------------------

/**
 * `RouteStack` — the difference between a router and native navigation.
 *
 * `RouteView` renders one slot: the screen you are on replaces the screen you
 * were on, and the one that left is gone. A device does not work that way. A
 * pushed screen sits ON a stack, the one underneath stays alive with its scroll
 * position and its half-typed form, and going back reveals it rather than
 * rebuilding it.
 *
 * What makes that expressible is `router.depth`, and it is worth saying why the
 * matched route is not enough: `/stack/1` → `/stack/2` is one route and two
 * screens when it was pushed, and one route and one screen when it was
 * replaced. Nothing in `route()` tells those apart. The depth does.
 */
const STACK_ROUTES = [
  { path: '/', view: () => <StackScreen title="Root" tint="var(--surface-alt)" /> },
  { path: '/one', view: () => <StackScreen title="One" tint="var(--surface)" /> },
  { path: '/two', view: () => <StackScreen title="Two" tint="var(--surface-alt)" /> },
]

const Stack = (): LynxElement => {
  // Its own router on its own in-memory history, so pushing here does not move
  // the app around it — the same reason `SecondRouter` has one.
  const stack = createRouter({ history: createMemoryHistory(), routes: STACK_ROUTES })

  return (
    <Panel
      title="RouteStack"
      blurb="Push twice and go back: the screen underneath was never torn down, so it comes back with whatever state it had. A single-slot RouteView would have rebuilt it."
    >
      <Row gap="sm">
        <Action onTap={() => stack.navigate('/one')}>push /one</Action>
        <Action onTap={() => stack.navigate('/two')}>push /two</Action>
        <Action onTap={() => stack.navigate('/two', { replace: true })}>replace /two</Action>
        <Action onTap={stack.back} disabled={() => !stack.canGoBack()}>
          back
        </Action>
      </Row>

      <RouteStack router={stack} transition={fadeTransition()} style={{ height: 190, marginTop: 8 }} />

      <Readout>{() => `depth: ${stack.depth()}   path: ${stack.route().path}`}</Readout>

      <Prose>
        The transition is a cross-fade and it is the only one shipped, because opacity is the one property that composes
        with whatever the screen underneath is doing. It leaves no style behind either — the settled tree is identical
        whether it ran, was skipped for a reduced-motion preference, or was interrupted by a second navigation.
      </Prose>

      <Prose>
        Buried screens are hidden rather than removed, so they stay out of the accessibility tree while keeping their
        state. That is the same `display: none` the runtime uses for `show`, which is why hiding survives a style write
        on the card.
      </Prose>
    </Panel>
  )
}

/** One screen in the demo stack, with local state so surviving a push is visible. */
const StackScreen = (props: { title: string; tint: string }): LynxElement => {
  const taps = signal(0)

  return (
    <view style={{ flex: 1, padding: 12, gap: 6, backgroundColor: props.tint }}>
      <TextLine>{props.title}</TextLine>
      <Action onTap={() => taps(taps() + 1)}>tap me, then push and come back</Action>
      <Readout>{() => `${props.title} has been tapped ${taps()} time(s)`}</Readout>
    </view>
  )
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/**
 * A link into the app's router.
 *
 * `RouteLink` takes `navigate` explicitly rather than reaching into a context,
 * so it stays a plain component with no ambient state — and an app with two
 * routers, like this screen, is not forced to pick a winner.
 */
const Link = (props: { to: string; children: string }): LynxElement => (
  // `router.navigate` is read here rather than aliased at module scope, and
  // that is load-bearing: `routes.tsx` imports this screen and this screen
  // imports `routes.tsx`, so at the moment this module is evaluated the router
  // has not been constructed yet. A top-level `const appRouter = router` would
  // capture `undefined` and fail on the first tap — reading the binding inside
  // a component defers it to render time, by which point the cycle has settled.
  <RouteLink to={props.to} navigate={(to, options) => router.navigate(to, options)} class="action-label" style={LINK}>
    {props.children}
  </RouteLink>
)

/** Links read as links, and Lynx has no `:hover` or `:visited` to lean on. */
const LINK = { color: 'var(--accent)' }

/** Log rows are a sequence, so they are set in a monospaced face. */
const MONO = { fontFamily: 'monospace', fontSize: 12 }

/**
 * A block of readout lines, one element per line.
 *
 * Deliberately not one `Readout` with newlines in it: Lynx lays a text run out
 * the way CSS does, so the newlines would collapse into spaces. `Index` is the
 * right collection component because these rows are positions in a listing and
 * the same line can legitimately repeat.
 */
const Lines = (props: { children: () => readonly string[] }): LynxElement => (
  <view class="card">
    <Index each={props.children}>
      {(line) => (
        <text class="card-meta" style={MONO}>
          <raw-text text={line} />
        </text>
      )}
    </Index>
  </view>
)
