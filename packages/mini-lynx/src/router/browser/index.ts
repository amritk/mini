/**
 * `@amritk/mini-lynx/router/browser` — the one file in this package that knows
 * what a browser is.
 *
 * Everything else here compiles against `lib: ["ESNext"]` with no ambient
 * platform at all, because Lynx's main-thread context is not a browser and a
 * stray `document` is a bug on the target that matters. This entry gets its own
 * compiler pass (`tsconfig.dom.json`) that adds the DOM library, and it is
 * deliberately one module wide: an app importing it is saying it renders on the
 * web, and an app that does not never resolves it.
 *
 * What lives here is a {@link RouterHistory} and nothing more. Matching,
 * navigation, the stack and the screens are all target-free already — the whole
 * design of `/router` is that only *moving between locations* has a per-target
 * answer — so the web needs exactly one implementation of exactly one seam.
 *
 * ```ts
 * import { createRouter, RouteStack } from '@amritk/mini-lynx/router'
 * import { createBrowserHistory } from '@amritk/mini-lynx/router/browser'
 *
 * const router = createRouter({ history: createBrowserHistory({ base: '/app' }), routes })
 * ```
 *
 * ## What is deliberately not here
 *
 * **Hash mode.** `@amritk/mini/router` carries one because it is a web-first
 * router that has to survive any static host. Here the web is the secondary
 * target and its host is the app's own choice, so the answer is to configure
 * that host for an SPA fallback — one line in a Worker or an Nginx config —
 * rather than to carry a second URL grammar the device build can never use. An
 * app that truly needs it can write the six-member seam itself.
 */

export { type BrowserHistoryOptions, createBrowserHistory } from './create-browser-history'
