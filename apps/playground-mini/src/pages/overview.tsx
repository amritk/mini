import { Link, type Route, type Router } from '@amritk/mini/router'

import { Page, Section } from '../lib/ui'

/** One line per subpath, so the entry-point layering is visible on the way in. */
const ENTRIES: readonly { readonly path: string; readonly name: string; readonly what: string }[] = [
  { path: '/signals', name: '@amritk/mini', what: 'signals, computed, effect, batch, watch, onCleanup' },
  { path: '/jsx', name: '@amritk/mini/jsx-runtime', what: 'the compilerless JSX transform and its one rule' },
  { path: '/bindings', name: '@amritk/mini', what: 'bindText/Attr/Class/Show/Value/Checked/Select/Html, template' },
  { path: '/flow', name: '@amritk/mini/flow', what: 'Show, Switch/Match, For, Dynamic' },
  { path: '/lists', name: '@amritk/mini', what: 'list — the only reconciler in the package' },
  { path: '/forms', name: '@amritk/mini/forms', what: 'createForm, Field, function and JSON Schema validation' },
  { path: '/query', name: '@amritk/mini/query', what: 'createQuery over @tanstack/query-core' },
  { path: '/router', name: '@amritk/mini/router', what: 'createRouter, Link, RouterView, matchRoute' },
]

export type OverviewPageProps = {
  router: Router<Route>
}

export const OverviewPage = (props: OverviewPageProps): HTMLElement => (
  <Page
    title="mini — kitchen sink"
    lede="Every public entry point of @amritk/mini, running. The app itself is built with the package: one router, one mount, no build-step transform beyond the standard JSX one, and no virtual DOM anywhere underneath."
  >
    <Section
      title="What is here"
      blurb="Each page is one subpath. The core . entry is byte-budgeted and imports none of the others, so a widget that only needs signals and bindings pays for nothing below the first two rows."
    >
      <ul class="list">
        {ENTRIES.map((entry) => (
          <li>
            <Link to={entry.path} navigate={props.router.navigate}>
              <code>{entry.name}</code>
            </Link>
            <span class="muted">{entry.what}</span>
          </li>
        ))}
      </ul>
    </Section>

    <Section
      title="The rule worth reading first"
      blurb="Reactivity is decided by value shape at runtime, because nothing compiles your code."
    >
      <div class="stack">
        <div class="out">
          {[
            '<button disabled={streaming}>     ✓ reactive — tracks forever',
            '<button disabled={streaming()}>   ✗ STATIC — frozen at creation',
            '<span>{() => count() * 2}</span>  ✓ reactive derived text',
            '<span>{count()}</span>            ✗ static text, frozen',
          ].join('\n')}
        </div>
        <p class="muted">
          A signal is a zero-argument function, so passing it uncalled is already a live binding. The shipped Vite
          plugin catches the second and fourth forms; this playground runs it, which is why they cannot creep in here.
        </p>
      </div>
    </Section>

    <Section
      title="How this is deployed"
      blurb="Vite builds a static bundle and Cloudflare serves it from an assets-only Worker — no server, no SSR, no hydration, because there is nothing to hydrate."
    >
      <div class="out">
        {[
          'bun run --filter @amritk/playground-mini dev       # vite dev server, hot updates through @amritk/mini/hot',
          'bun run --filter @amritk/playground-mini build     # static bundle into dist/',
          'bun run --filter @amritk/playground-mini deploy    # wrangler deploy',
        ].join('\n')}
      </div>
    </Section>
  </Page>
)
