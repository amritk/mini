import { Link, RouterView } from '@amritk/mini/router'

import { NAV, router } from './routes'

/**
 * The shell: a sidebar built from the route table and one `<RouterView>` outlet.
 *
 * Both halves are ordinary components. `App` runs exactly once — every update
 * after that is a binding writing a property, which is why there is no memo
 * here, nothing to key, and no reason for the nav to know what the outlet is
 * doing.
 */
export const App = (): HTMLElement => (
  <div class="shell">
    <aside class="sidebar">
      <a class="brand" href="/">
        mini
      </a>
      <p class="brand-sub">kitchen-sink playground</p>
      <nav class="nav">
        {NAV.map((route) => (
          <Link
            to={route.path}
            navigate={router.navigate}
            // `active` is a getter, so it tracks the route signal forever. The
            // exact-match test is deliberate: `/router/:owner/:repo` should
            // still light up the `/router` entry, hence the prefix arm.
            active={() => router.route().path === route.path || router.route().path.startsWith(`${route.path}/`)}
            activeClass="active"
          >
            {route.label}
          </Link>
        ))}
      </nav>
    </aside>
    <main class="main">
      <RouterView router={router} fallback={() => <NotFound />} />
    </main>
  </div>
)

/** Rendered when nothing in the table matched — `route().route` is `null`. */
const NotFound = (): HTMLElement => (
  <div class="page">
    <h1>404</h1>
    <p class="lede">
      Nothing in the route table matched this path. On Cloudflare you still got here rather than a hard 404, because the
      Worker serves <code>index.html</code> for unknown paths and lets the client router decide.
    </p>
    <Link to="/" navigate={router.navigate} class="pill">
      back to the overview
    </Link>
  </div>
)
