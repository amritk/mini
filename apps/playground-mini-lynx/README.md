# `@amritk/playground-mini-lynx`

A kitchen-sink demo of [`@amritk/mini-lynx`](../../packages/mini-lynx) —
signals over Lynx — previewed in a browser through a DOM implementation of
Lynx's Element PAPI, and deployed to Cloudflare Workers as a static SPA.

It also exercises the packages either side of the runtime:
[`@amritk/mini-lynx-native`](../../packages/mini-lynx-native), the bridge to
Lynx's background context, and the four native modules built on it —
[`lynx-notifications`](../../packages/lynx-notifications),
[`lynx-location`](../../packages/lynx-location),
[`lynx-dialogs`](../../packages/lynx-dialogs) and
[`lynx-deep-linking`](../../packages/lynx-deep-linking).

Private, unpublished, and not part of the release.

## What changed, and why the preview works the way it does

The previous version of this app ran through a DOM **host**: a framework
abstraction the package owned, with the browser and the device as two peer
targets. That abstraction is gone — the package targets Lynx and nothing else —
so the preview drops one level down and implements the **engine's** API instead.

`src/lib/dom-papi.ts` is that implementation. It is the same move Lynx itself
makes in `@lynx-js/web-platform`, where `web-core` reimplements the Element PAPI
in JavaScript over custom elements; this is a small, honest subset of the same
idea. The important consequence is that the relationship is no longer symmetric:
**the browser is emulating Lynx**, so when the two disagree the preview is what
is wrong.

Two things it structurally cannot show, both stated on the screens that would
otherwise imply otherwise:

- **A missing flush.** `__FlushElementTree` is a no-op here because the DOM is
  eager, so a mutation that never gets committed still appears.
- **Anything element-creation-specific.** On a device `__CreateElement('view')`
  builds something that is not really a view; in a browser every tag is a custom
  element and the distinction does not exist. The engine's own web port has the
  same blind spot, which is exactly how that bug survived so long.

## The other stand-in: a device

The runtime is only half of what a Lynx app touches. `NativeModules` and
`GlobalEventEmitter` live in the **background** JavaScript context, which a
browser does not have either — so `src/lib/fake-device.ts` stands in for it the
way `dom-papi.ts` stands in for the engine.

It is wiring rather than invention. Each native package publishes the fake its
own suite runs against — `@amritk/lynx-location/testing` and the three beside
it — precisely so that an app testing its own screens does not write a second
one, and this app is the first consumer to take them up on it. `fake-device.ts`
creates the pair of context proxies, installs the background half of the bridge
over them, and registers the four fakes as the module registry. Nothing about
any module is reimplemented here.

What that buys, and what it does not:

- **The contract is real.** Method names, arities, call forms, the protocol,
  the handshake, and every platform rule the fakes reproduce — a permission
  request after a refusal returning the refusal, a second dialog answering
  `busy`, an undeclared scheme answering `noHandler`, a cold-start link replayed
  exactly once.
- **The platform is not.** No permission sheet is presented, no radio is woken,
  nothing survives a reload, and the thread hop is a microtask. The Kotlin and
  the Objective-C on the far side of these calls **have never run**, here or
  anywhere else in this repository — see each package's README.

Two things the preview seeds at boot, because no button can produce them once
the process is running: the URL that launched the app, and a notification tap
that happened before any JavaScript existed. Both are read back through the real
`getInitialURL` and `onNotificationResponse`, by the one subscription an app
makes at its root rather than on a screen (`src/lib/native-root.ts`).

## Running it

```sh
bun install                                               # from the repo root
bun run --filter '@amritk/playground-mini-lynx' dev      # vite dev server
bun run --filter '@amritk/playground-mini-lynx' build    # static bundle into dist/
bun run --filter '@amritk/playground-mini-lynx' preview  # serve the built bundle
bun run --filter '@amritk/playground-mini-lynx' test     # the preview engine, every screen, tag coverage
```

The root `bun run build`, `types:check` and `test` all include this app.

## What is on each screen

| Route | What it shows |
| --- | --- |
| `/` | The element gallery: `view`, `image`, `scroll-view`, `frame`, `wrapper`, the `scroll-coordinator` family, and the exotic ones — `svg`, `blur-view`, `viewpager`, `refresh`, `overlay`, `webview`, `title-bar-view`, `video` |
| `/text` | `raw-text` inside `text`, `text-maxline`, inline images, `inline-truncation`, `markdown` with its typewriter streaming, and Lynx's no-inheritance rule |
| `/list` | `<list>` with grid and waterfall layout, sticky headers, snap, load-more and `list-row` grouping — the element the old five-tag vocabulary could not express at all |
| `/styling` | CSS as a first-class channel: classes, custom properties, `@keyframes`, `linear` and `relative` layout, and the unit rule |
| `/events` | Bubbling, `catch` interception, capture-phase handlers, and how a listener actually reaches a closure |
| `/flow` | `Show`, `Switch`/`Match`, `For`, `Index`, `Dynamic`, `list`, and the `wrapper` control flow renders into |
| `/compose` | `createContext`, `Portal`, `ErrorBoundary` |
| `/forms` | `createForm`, `Field`, JSON Schema validation, `<input>` and `<textarea>` |
| `/keyboard` | `trackKeyboard`, `KeyboardAvoiding`, `avoidKeyboard`, `keyboardLift` — the arithmetic every form gets wrong |
| `/data` | `createQuery` over `@tanstack/query-core` |
| `/engine` | A second tree rendered through the in-memory Element PAPI, with the call log — what the runtime actually does to the engine |
| `/routing` | `createRouter`, `route`, `RouteView`, `RouteStack`, `RouteLink`, `createBrowserHistory`, `createMemoryHistory`, `buildPath`, typed params |
| `/native` | `@amritk/mini-lynx-native`: both call forms and the two ways to pick the wrong one, rejection versus a resolved failure, `isNativeModuleAvailable`, `onNativeEvent`, and the message transcript |
| `/notifications` | `@amritk/lynx-notifications`: the one-shot permission, channels, scheduling and cancelling, foreground arrivals, the cold-start tap, the rotating device token, the badge |
| `/location` | `@amritk/lynx-location`: permission versus the device switch, `getCurrentPosition` as a union, `watchPosition` and its unsubscribe, `reverseGeocode` and its four failures |
| `/dialogs` | `@amritk/lynx-dialogs`: date picker, action sheet and alert — with a stand-in dialog surface drawn from what the fake module reports as presented |
| `/links` | `@amritk/lynx-deep-linking`: the launch URL versus the link event, `parseURL`'s host-and-path trap, `createURL`, `openURL`/`canOpenURL`/`openSettings` |

## Keeping up with the engine

Every tag in the vocabulary is built on some screen above, and
`src/vocabulary-coverage.test.ts` is what keeps that true. The vocabulary is
derived from `@lynx-js/types` rather than transcribed, so a tag the engine adds
arrives here with no release in the package — and with nothing to make anyone
notice it is undemoed. The test reads the tag list out of the package's source
and fails when one of them is not written anywhere in `src/`.

Two tags are exempt, with the reason recorded next to them: `page` is the root
the framework already generates, and `component` is Lynx's own component
instantiation, which this runtime does not drive.

Because the vocabulary is a type, that check is a source scan — it sees a tag
that is *written*, not one that is genuinely exercised. That is the right
approximation to accept: writing the tag is what pins its attribute spellings and
its nesting rules, which is the part a preview can actually verify.

Every public entry point of the runtime appears above, and so does every
exported function of the five packages around it. That is the bar this app is
held to: a new subpath, or a new native module, is not finished until a screen
here exercises it. `src/screens.test.ts` mounts each one through the same
preview engine the app runs on, which is the cheapest guard against a screen
that throws on the way up and is noticed by whoever next opens that tab.

## The conventions it follows

**It is written the way a Lynx app is written.** Lynx tags, Lynx attribute
names, Lynx event names. There is no vocabulary in between and therefore no
translation table anywhere in this app or in the package it demonstrates — which
is the whole point of the rewrite, and the reason the engine's own documentation
applies to this code verbatim.

**Styling is a stylesheet.** `src/styles.css` is real CSS, because Lynx has real
CSS: classes carry everything static and an inline `style` prop carries what is
genuinely dynamic. The previous version deliberately had no stylesheet at all,
since a five-tag vocabulary's only portable channel was a bag of numbers. The
rules that exist only to make a *browser* lay out like Lynx are kept separately,
in `src/lib/install-lynx-reset.ts`, so `styles.css` stays something you could
ship to a device.

**Dark mode is a class, not a media query.** Lynx has no `@media` and no
`prefers-color-scheme`. The platform's colour scheme arrives as data and the app
decides what to do with it, which is what the header switch stands in for.

**Layouts fit rather than respond.** The corollary of no `@media` is that there
is no breakpoint to fall back on: a screen either works at whatever width the
device hands it or it does not. So `<Row>` wraps by default and the controls in
one may shrink — a run that does not fit continues on the next line instead of
being clipped at the edge, which is what Lynx does to it otherwise, taking the
tap targets with it.

## Deploying

An assets-only Worker: no `main`, so Cloudflare serves `dist/` from its edge
cache without invoking a Worker.

```sh
bun run --filter '@amritk/playground-mini-lynx' deploy      # build + wrangler deploy
bun run --filter '@amritk/playground-mini-lynx' deploy:dry  # build + validate, no upload
```

`wrangler` needs `CLOUDFLARE_API_TOKEN` (and `CLOUDFLARE_ACCOUNT_ID` when the
token can see more than one account).
`.github/workflows/deploy-playgrounds.yml` does the same on a push to `main`,
and skips itself when the secret is absent.

The router runs on `createBrowserHistory` from
`@amritk/mini-lynx/router/browser`, so every screen is a real URL you can
reload, bookmark and share, and the browser's back button drives the router
through `popstate`. That is the whole reason the Worker sets
`not_found_handling: "single-page-application"` — a hard reload on `/forms`
has to reach `index.html`.

It is worth being precise about what that does and does not demonstrate. A
device build swaps one argument, `createMemoryHistory()`, and changes nothing
else: the route table, the screens, `RouteStack` and the matching are all
target-free, because moving between locations is the only half of routing with
a per-target answer. The address bar is a browser affordance the real target
does not have, and the preview shows it here rather than pretending otherwise.
