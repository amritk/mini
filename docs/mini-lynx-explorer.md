# rspeedy, a QR code, and Lynx Explorer

How a `@amritk/mini-lynx` app gets onto a phone, why the build has the shape it
has, and — the part that matters most — exactly which links in that chain have
been verified and which have not.

The code this describes is
[`packages/mini-lynx-rsbuild-plugin`](../packages/mini-lynx-rsbuild-plugin) and
[`apps/starter-mini-lynx`](../apps/starter-mini-lynx).

---

## 1. The loop

```
rspeedy dev  →  http://<your-lan-ip>:3000/main.lynx.bundle  →  QR code  →  Explorer  →  app
      ↑                                                                                  │
      └──────────────────── save a file, the page reloads ───────────────────────────────┘
```

Concretely:

```bash
cd apps/starter-mini-lynx
bun install
bun run dev
```

```
  ➜  Lynx          http://192.168.1.24:3000/main.lynx.bundle
  ➜  ∟ Fullscreen  http://192.168.1.24:3000/main.lynx.bundle?fullscreen=true
```

Scan either QR code with [Lynx Explorer](https://lynxjs.org/guide/start/quick-start.html)
— the Lynx team's host app, whose whole job is to open a bundle URL — or paste
the URL into its *Enter Card URL* box, which is what a simulator needs. The app
is on the screen. Edit `src/main-thread.tsx`, save, and it reloads.

`bun run build` produces `dist/main.lynx.bundle`, which is the same artifact
without the dev server around it.

## 2. Why a build plugin was needed at all

A Lynx template is not a bundle with an entry point. It is a container with two
code slots and a compiled stylesheet:

| Slot | What runs there | In this repo |
| --- | --- | --- |
| main-thread chunk | the Element PAPI, executed by the engine to build the first screen | your whole app |
| background chunk (`/app-service.js`) | `NativeModules`, `GlobalEventEmitter` | `@amritk/mini-lynx-native/background`, or nothing |
| CSS | compiled by the encoder into the template, not shipped as text | `app.css` |

`@lynx-js/rspeedy` builds the container and runs the dev server. **Which code
goes in which slot is the framework's to say**, and every framework says it in a
plugin of its own — ReactLynx's is `@lynx-js/react-rsbuild-plugin`. There is no
framework-agnostic plugin underneath it to reuse: `@lynx-js/rsbuild-plugin`,
which sounds like one, is the dev server and the per-thread minifier split
rather than the template.

So the gap between "this runtime works" and "you can run it on your phone" was
about 150 lines of rspack wiring that every consumer would otherwise have
written, wrongly, once each. That is what the plugin is.

The single sharpest edge in it: the encoder decides which chunk is the first
screen by reading one `lynx:main-thread` boolean off the asset's info. Nothing
sets it for a runtime that is not ReactLynx, and nothing complains when it is
missing — a template with no main-thread slot is a legal template. You get a
build that succeeds, a bundle that loads, and a blank screen.

## 3. Reload, not hot update

The dev build adds two modules to the front of the background chunk:
`@lynx-js/webpack-dev-transport/client` (the socket back to the dev server,
which rspeedy aliases with the host, port and token already in its query) and
`@rspack/core/hot/dev-server`, which rspeedy aliases to the Lynx build that
reloads through the devtool rather than through a `window.location` that does
not exist.

Nothing in a mini-lynx app accepts a hot update, and nothing should. A hot
update is a diff applied to a live module graph; this runtime has no such graph,
because a component runs once and the tree it built is mutated by signals
forever. There is no second render for a new module version to be applied to.

What the runtime *does* have is a teardown: `renderPage` claims
`removeComponents`, which the engine calls before it rebuilds. So the fallback —
an update nothing accepted bubbles to the entry, fails to apply, and the page
reloads — is not a degraded outcome here. It is the correct one, and it is
cheap: the app is a few hundred kilobytes served off localhost.

The reload itself is `Page.reload` sent over the devtool's CDP channel, so it
needs Explorer (or a host app with the devtool enabled). Without one, the socket
still connects and the terminal still rebuilds; you pull to refresh by hand.

## 4. What has been verified, and how

This matters more than usual here, because the failure mode of a Lynx build is
silence: the bundle encodes, the device loads it, and nothing appears.

### Verified in CI, on every commit

`packages/mini-lynx-rsbuild-plugin/src/build.test.ts` runs **real rspeedy
builds** of a real app — one with a background module and one without, since the
second is what a consumer gets before they have anything native to reach for —
and then runs the artifact:

- the template is emitted, and is a template rather than an empty container;
- the main-thread slot is filled — the failure above, caught directly;
- the background slot is filled, and reaches the encoder under the
  `/app-service.js` name the engine's module loader requires;
- the app's CSS was compiled into the template;
- the engine's module wrapper is on the background chunk and **not** on the
  main-thread one;
- the built main-thread chunk, pulled out of the encoder's input and executed in
  a `node:vm` context whose globals are `createFakeEngine`'s Element PAPI,
  **renders the app** — the right tree, and `firstScreen` emitted;
- a tap dispatched through that same fake mutates the existing `<text>` element
  rather than replacing it, so the runtime's whole claim survives the bundler.

That last pair is the point. A JSX transform pointed at React, a wrapper on the
wrong chunk, a `renderPage` that never reached the global object: each is a
passing string search over the template and a blank screen on the phone. Each
fails that test instead.

`apps/starter-mini-lynx/src/app.test.ts` does the same for the app itself,
without a build — which is also the shortest demonstration that an app on this
runtime is testable with no device, no emulator and no browser.

### Verified by hand, in a container, against the real dev server

Everything up to the phone:

- `rspeedy dev` starts, prints the LAN URL and both QR schemas;
- `GET http://<host>:3000/main.lynx.bundle` returns **200** and a real encoded
  template (the magic bytes, `/app-service.js`, the main-thread code inside it);
- the dev bundle carries the transport client and the devtool reload path — the
  `rsbuild-hmr` socket path and `Page.reload` are both in the served bytes;
- editing `src/main-thread.tsx` triggers a rebuild and the **next fetch of the
  same URL returns the edited app**, which is the watch half of the loop.

### Not verified — no device was available

Everything from the QR code onward:

- that Explorer renders this template, at `targetSdkVersion: '3.2'`, in the
  version you install;
- that the reload actually fires on save on the device, rather than the socket
  connecting and the CDP call being refused;
- that events reach handlers on hardware. This is the runtime's own open
  question rather than the build's — the worklet-handle transport in
  `@amritk/mini-lynx` is inferred from the engine's source, and
  `@amritk/mini-lynx/bridge` is the fallback if it is wrong. See *Before you
  ship* in [the runtime's README](../packages/mini-lynx/README.md);
- layout. The fake engine records what it was asked to do and lays nothing out.

**Treat the phone half as unproven.** The build half is not.

## 5. When the phone shows nothing

In rough order of likelihood:

1. **The phone cannot reach your laptop.** The URL is a LAN address; a guest
   network, a VPN, or a host-only firewall rule all produce exactly the same
   symptom. `curl` the URL from another device on the same network first.
2. **`targetSdkVersion` is ahead of your Explorer.** An Explorer older than the
   template refuses it outright and says so in terms of the SDK rather than your
   code. The plugin's default is `'3.2'`, which is also ReactLynx's.
3. **A blank screen with a running app** is the main-thread slot being empty, or
   a throw during the build of the tree. `renderPage` emits `firstScreen` even
   when the root component threw — deliberately, because a splash screen that
   never dismisses tells you nothing — so a blank screen means look for the
   error report, and `setErrorHandler` is where it went.
4. **The tree renders and nothing responds to touch.** That is the worklet
   transport question above, not the build. Swap in
   `namedHandlerTransport` from `@amritk/mini-lynx/bridge` and see if the app
   comes alive.
5. **The screen labelled `background chunk` says `no answer`.** The background
   half is missing or threw. It is the one part of the app whose failure is
   otherwise invisible, which is why the starter puts it on screen.

## 6. What is deliberately not here

**No `create-mini-lynx` scaffolder.** The app is four files and copying them is
faster than maintaining a generator. `apps/starter-mini-lynx` is the template,
and its README says which lines to change.

**No web environment.** The plugin does nothing in an environment named `web`.
A mini-lynx app on the web is a real question — the runtime's DOM story is
`@amritk/mini`, not a Lynx build — and a plugin that half-configured one would
be worse than a plugin that skips it.

**No lazy bundles, and no layer-based module resolution.** ReactLynx compiles
the same source twice, once per thread, and uses webpack layers to swap what
each import resolves to. Here the two chunks are two files you wrote. That is
simpler, and it means nothing stops a background module from being imported into
the main-thread chunk: if you import it, you get it.
