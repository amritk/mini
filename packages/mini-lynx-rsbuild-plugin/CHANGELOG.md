# @amritk/mini-lynx-rsbuild-plugin

## 0.2.0

### Minor Changes

- d572153: Add `@amritk/mini-lynx-rsbuild-plugin` — the rspeedy build for a
  `@amritk/mini-lynx` app, so `rspeedy dev` → QR code → Lynx Explorer works on day
  one.

  A Lynx template is a container with two code slots — a main-thread chunk the
  engine executes to build the first screen and a background chunk it loads as
  `/app-service.js` — plus CSS the encoder compiles. rspeedy builds the container;
  which code goes in which slot is the framework's to say, and every framework
  says it in a plugin of its own. This is that plugin for a runtime that renders
  on the main thread and drives the Element PAPI itself: `pluginMiniLynx()` splits
  one entry into two chunks, adds the template plugin and encoder, sets the
  `lynx:main-thread` asset flag the encoder splits on, wraps the background chunk
  for the engine's module loader, and points the JSX transform at
  `@amritk/mini-lynx`.

  In `dev` it wires the dev-server client and a devtool reload. Nothing hot-updates
  and nothing should — a component runs once here — so an update no module accepts
  falls through to a page reload, which is safe because `renderPage` claims
  `removeComponents`.

  `apps/starter-mini-lynx` is a four-file app built through it, and
  `docs/mini-lynx-explorer.md` records the loop along with what has been verified
  (one real build per commit, whose main-thread chunk is executed against the fake
  Element PAPI and asserted on) and what a device still has to answer.
