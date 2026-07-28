import { onCleanup, signal, watch } from '@amritk/mini'
import { Link, RouterView } from '@amritk/mini/router'

import { NAV, router } from './routes'

/**
 * The shell: a nav built from the route table and one `<RouterView>` outlet.
 *
 * On a wide screen the nav is a sidebar. Below that it is a drawer behind a top
 * bar, because nine multi-word labels laid out as a wrapped row cost three lines
 * at the top of every page and put the links furthest from the thumb — and the
 * page you are reading matters more than the nine you are not.
 *
 * Both halves are ordinary components, and the drawer is one signal. `App` runs
 * exactly once — every update after that is a binding writing a class or an
 * attribute, which is why there is no memo here, nothing to key, and no reason
 * for the nav to know what the outlet is doing.
 */
export const App = (): HTMLElement => {
  const menuOpen = signal(false)
  const closeMenu = (): void => menuOpen(false)

  // Changing section closes the drawer and returns to the top. The SECTION, not
  // the path: `/router/:owner/:repo` navigates within its own page to show that
  // params update in place, and yanking the scroll position out from under that
  // demo would be reporting a page change that did not happen. Both routes carry
  // the label `Routing`, so watching it is exactly the "different page" test.
  watch(
    () => router.route().route?.label ?? '',
    () => {
      closeMenu()
      window.scrollTo({ top: 0 })
    },
  )

  // While the drawer is open the page behind it must not scroll — a phone will
  // happily scroll the body under an overlay otherwise, and you come back to a
  // page you did not mean to move.
  watch(menuOpen, (open) => {
    document.body.classList.toggle('nav-open', open)
  })

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') closeMenu()
  }
  window.addEventListener('keydown', onKeyDown)
  onCleanup(() => window.removeEventListener('keydown', onKeyDown))

  return (
    <div class={() => ['shell', menuOpen() && 'shell-menu-open']}>
      <header class="topbar">
        <button
          type="button"
          class="menu-button"
          // The state has to be spelled out for a screen reader, and `aria-*`
          // takes the strings "true"/"false" rather than the presence of the
          // attribute the way `disabled` does.
          aria-expanded={() => String(menuOpen())}
          aria-controls="nav"
          onClick={() => menuOpen(!menuOpen())}
        >
          <span class="menu-icon" aria-hidden="true" />
          <span class="visually-hidden">{() => (menuOpen() ? 'Close navigation' : 'Open navigation')}</span>
        </button>
        <span class="topbar-title">
          mini
          <span class="topbar-section">{() => router.route().route?.label ?? 'not found'}</span>
        </span>
      </header>

      {/* The scrim is a second way to dismiss, not the only one — it is hidden
          from assistive tech because Escape and the toggle above already are
          the accessible route out. */}
      <div class="scrim" aria-hidden="true" onClick={closeMenu} />

      <aside class="sidebar" id="nav">
        <a class="brand" href="/">
          mini
        </a>
        <p class="brand-sub">kitchen-sink playground</p>
        {/* Dismissal is delegated to the container rather than added per link,
            because `<Link>` owns its own click handler and forwards none — and
            because tapping the entry you are already on should still close the
            drawer, which a route watcher cannot see. */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the container is not the control — every child is an <a>, and activating one from the keyboard dispatches the click this handler is listening for */}
        <nav class="nav" onClick={closeMenu}>
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
}

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
