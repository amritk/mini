<div align="center">

# @amritk/mini-lynx-rsbuild-plugin

**`rspeedy dev` → QR code → your app on the phone. The build half of [`@amritk/mini-lynx`](../mini-lynx).**

![status](https://img.shields.io/badge/status-pre--alpha-ef4444?style=flat-square)&nbsp;
![version](https://img.shields.io/npm/v/@amritk/mini-lynx-rsbuild-plugin?style=flat-square&logo=npm&logoColor=white&label=version&color=6366f1)&nbsp;
![license](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)&nbsp;
![vibe coded](https://img.shields.io/badge/vibe-coded-a855f7?style=flat-square)

</div>

---

## What it is

One [rsbuild](https://rsbuild.rs) plugin that teaches
[rspeedy](https://lynxjs.org/rspeedy) — Lynx's build tool — how to build a
`@amritk/mini-lynx` app.

A Lynx template is not a bundle with an entry point. It is a container with two
code slots — a **main-thread** chunk the engine executes to build the first
screen, and a **background** chunk it loads as `/app-service.js` — plus the CSS,
which the encoder compiles rather than shipping as text. rspeedy builds the
container. Which code goes in which slot is the framework's to say, and every
framework says it in a plugin of its own: ReactLynx's is
`@lynx-js/react-rsbuild-plugin`, and there is no framework-agnostic one
underneath it to reuse.

This is that plugin, for a runtime that renders on the main thread and drives
the Element PAPI itself.

## Install

```bash
npm install -D @amritk/mini-lynx-rsbuild-plugin @lynx-js/rspeedy @lynx-js/qrcode-rsbuild-plugin
# or: pnpm add -D / yarn add -D / bun add -d
```

## A complete app

```ts
// lynx.config.ts
import { pluginMiniLynx } from '@amritk/mini-lynx-rsbuild-plugin'
import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'
import { defineConfig } from '@lynx-js/rspeedy'

export default defineConfig({
  source: { entry: { main: './src/main-thread.tsx' } },
  plugins: [
    pluginQRCode({ fullscreen: true }),
    pluginMiniLynx({ background: './src/background.ts' }),
  ],
})
```

```tsx
// src/main-thread.tsx — the main-thread chunk, and the whole app
import { renderPage, signal } from '@amritk/mini-lynx'
import './app.css'

const App = () => {
  const count = signal(0)
  return (
    <view class="card" bindtap={() => count(count() + 1)}>
      <text>{() => `tapped ${count()} times`}</text>
    </view>
  )
}

renderPage(App)
```

```ts
// src/background.ts — the background chunk. Leave the option off and you get a
// stub; this is where `NativeModules` lives, so it is where the bridge installs.
import { installNativeBridge } from '@amritk/mini-lynx-native/background'

installNativeBridge()
```

Then:

```bash
rspeedy dev     # prints a QR code; scan it with Lynx Explorer
rspeedy build   # dist/main.lynx.bundle
```

A runnable version of exactly this is
[`apps/starter-mini-lynx`](../../apps/starter-mini-lynx), and the loop it
belongs to — Explorer, the QR code, what to do when the phone shows nothing — is
[`docs/mini-lynx-explorer.md`](../../docs/mini-lynx-explorer.md).

## Options

| Option | Default | What it is |
| --- | --- | --- |
| `background` | a stub | The module that runs in the background chunk |
| `targetSdkVersion` | `'3.2'` | The Lynx engine version the template is encoded for |

## What the plugin does, exactly

Per entry in `source.entry`:

1. **Splits one entry into two.** `main` becomes `main__main-thread` (your app)
   and `main` (the background module), emitted into `.rspeedy/main/`. The
   background entry keeps the original name because that is what rspeedy derives
   the template filename, the dev server's URLs and the QR code from.
2. **Adds `LynxTemplatePlugin` and `LynxEncodePlugin`**, which collect those two
   chunks plus the CSS into one template and encode it.
3. **Flags the main-thread chunk.** The encoder splits an entry's assets by one
   `lynx:main-thread` boolean on the asset — set for ReactLynx by its own
   webpack plugin, and by a ~20 line rspack plugin here. Without it, every chunk
   looks like background code, the template encodes without complaint, and the
   app has no first screen.
4. **Wraps the background chunk** for the engine's module loader, and only that
   one.
5. **Points the JSX transform at `@amritk/mini-lynx`**, so a consumer does not
   configure SWC by hand to get a runtime that is not React.

## Reload rather than hot update

In `dev` the background chunk gets the dev-server client and
`@rspack/core/hot/dev-server` on the front. Nothing accepts a hot update and
nothing should: a component in this runtime runs once, and the tree it built is
mutated by signals forever, so there is no re-render for a new module version to
apply to. An update with no acceptor bubbles to the entry, fails, and the page
reloads through the devtool — which is correct here in a way it is not for a
VDOM framework, because `renderPage` claims `removeComponents` and tears the
previous tree down on the way past.

The reload is `Page.reload` over the devtool's CDP channel, so it needs an
Explorer (or a host app) with the devtool enabled.

## Known gaps

**No web environment.** In an environment named `web` this plugin does nothing.
A web build of a mini-lynx app is not a solved problem, and a plugin that
half-configured one would be worse than one that skips it.

**Lazy bundles are not wired.** `LynxTemplatePlugin` supports them and this
plugin does not configure them, so a dynamic `import()` from the main-thread
chunk is not something to rely on yet.

**No layer-based module resolution.** ReactLynx compiles the *same* source
twice, once per thread, and uses webpack layers to swap module resolution
between them. Here the two chunks are two files you wrote, which is simpler and
means `background-only`-style guards have nothing to hook into: if you import a
main-thread module from the background chunk, you get it.

> **Pre-alpha.** Every JS-side Lynx package is still 0.x and the template
> plugin's hooks are `@alpha` upstream, so a minor bump there can move this
> package's ground.

## License

[MIT](../../LICENSE)
