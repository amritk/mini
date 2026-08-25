# AI.md — @amritk/mini-lynx-rsbuild-plugin

For an LLM consuming this package. Editing the repo instead? See
[`AGENTS.md`](./AGENTS.md).

## Mental model

This is a **build-time** package. Nothing here runs on a device: it is one
rsbuild plugin that teaches [rspeedy](https://lynxjs.org/rspeedy) — Lynx's
build tool — how to turn a `@amritk/mini-lynx` app into a `.lynx.bundle`
template.

A Lynx template is not a bundle with an entry point. It is a container with two
code slots — a **main-thread** chunk the engine executes to build the first
screen, and a **background** chunk it loads as `/app-service.js` — plus the CSS,
which the encoder compiles rather than shipping as text. rspeedy builds the
container; which code goes in which slot is the framework's to say, and every
framework says it in a plugin of its own. ReactLynx's is
`@lynx-js/react-rsbuild-plugin`. This is that plugin for a runtime that renders
on the main thread and drives the Element PAPI itself.

## The surface, in full

```ts
import { pluginMiniLynx, type PluginMiniLynxOptions } from '@amritk/mini-lynx-rsbuild-plugin'

type PluginMiniLynxOptions = {
  /** The module that runs in the background chunk. Defaults to a stub that installs nothing. */
  background?: string
  /** The Lynx engine version the template is encoded for. Default '3.2'. */
  targetSdkVersion?: string
}

pluginMiniLynx(options?: PluginMiniLynxOptions): RsbuildPlugin
```

That is the whole package. One function, two options.

## A complete app

Four files. There is no `App.tsx` convention and no framework entry to extend —
`renderPage` is the entry.

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
// src/background.ts — the background chunk; omit it and the default stub is used
import { installNativeBridge } from '@amritk/mini-lynx-native/background'

installNativeBridge()
```

```jsonc
// tsconfig.json — the build reads jsxImportSource from the plugin, but the
// EDITOR reads it from here, so both have to say it
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@amritk/mini-lynx",
    "types": ["@lynx-js/types", "@lynx-js/rspeedy/client"]
  }
}
```

Then `rspeedy dev`, scan the QR code with Lynx Explorer, and the app is on the
phone.

## Gotchas

**`source.entry` names the MAIN-THREAD entry.** The background module is the
plugin's `background` option, not a second entry. Adding it to `source.entry`
would build a second template rather than a second chunk.

**Nothing hot-updates.** An edit reloads the whole page through the devtool.
This is not a limitation being worked around: a component in this runtime runs
once, so there is no re-render for a new module version to be applied to. What
makes the reload safe is that `renderPage` claims `removeComponents` and tears
the previous tree down.

**Live reload needs the devtool.** The reload is `Page.reload` over the CDP
channel, which Lynx Explorer has and a production host app usually does not.

**The plugin is for the `lynx` environment.** In a `web` environment it does
nothing — a web build of a mini-lynx app is not a solved problem here, and a
plugin that half-configured one would be worse than a plugin that skips it.

**`targetSdkVersion` is a compatibility floor, not a feature switch.** An
Explorer older than the version a template names refuses the template outright,
with a message about the SDK rather than about your code.

## Where the pieces are

| Thing | Owned by |
| --- | --- |
| The `.lynx.bundle` container, and encoding it | `@lynx-js/template-webpack-plugin` (a dependency here) |
| The dev server, the LAN URL, HMR transport | `@lynx-js/rspeedy` |
| The QR code in the terminal | `@lynx-js/qrcode-rsbuild-plugin` |
| Which chunk is which, and the JSX transform | this package |
| Everything that runs on the device | `@amritk/mini-lynx` |
