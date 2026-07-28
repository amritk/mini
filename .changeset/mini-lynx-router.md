---
'@amritk/mini-lynx': minor
---

Add routing on a new `@amritk/mini-lynx/router` subpath, with the browser's session history on `@amritk/mini-lynx/router/browser`.

The split is the whole design. **Matching a pattern against a path is string arithmetic** — it has no platform in it, and `@amritk/mini`'s router uses the same function for the same reason. **Moving between locations is not**: a browser has an address bar, a back button, and a session history the user shares across tabs; a device has a navigation stack the app owns outright and nothing the user can type into. Pretending those are one thing is how a router ends up with a `window` reference in the middle of a screen.

So `createRouter` takes a `RouterHistory`. `createMemoryHistory` is platform-free and ships in `/router` — it is the *native* history as much as the test one, because a stack of screens the app owns is exactly what a device has. `createBrowserHistory` is on its own entry, so importing the router never drags a browser assumption into a device build; the import-boundary suite asserts it.

`RouteView` keeps the screen when only the params changed. `/users/1` → `/users/2` is the same route, so scroll position, a focused field, and anything in flight survive while the `params()` getter reports the new values — which falls out of `renderChild` swapping on factory identity rather than on everything it read. A different route swaps the subtree. Params arrive as a getter for the same reason `Show` hands over its narrowed value that way: a component runs exactly once, so a plain object would be the params as they were when the screen was built.

`canGoBack` counts the steps *this app* took rather than reading `history.length`, which counts entries from every page the tab has visited and therefore cannot answer "would going back leave the app" — the only question a back chevron actually asks.

`RouteLink` is a real `Link` underneath, so on the web it is an actual `<a href>` and middle-click, open-in-new-tab, copy-link, and a crawler all work; only the plain activation that would reload the app is intercepted. It is also the one place in the package that reads `event.raw`, and the doc says so plainly rather than pretending otherwise: `preventDefault` and the modifier keys do not exist in the normalised payload because they do not exist on a device. It lives here because a router link that eats Cmd-click is a bug users report as "your site is broken", and that is knowledge worth writing once.

`parseQuery` is written by hand rather than through `URLSearchParams`, which is a web platform global and not an ECMAScript one — using it would put a browser assumption in the one part of routing that is otherwise pure.

Deliberately absent: a native navigation **stack** (pushing a screen over another and animating between them needs an animation seam that does not exist yet, and would be the wrong default for the web), and the web-only obligations — document title, scroll restoration, keeping the URL continuously correct — which are real work that only one target owes and belong in the app's web entry point.
