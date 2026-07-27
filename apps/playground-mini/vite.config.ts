import { defineConfig } from 'vite'

// The plugins are imported from the workspace SOURCE rather than through
// `@amritk/mini/vite`. Vite loads this config with plain Node resolution, which
// does not apply the `development` condition the rest of the app resolves
// through — so the package name here would point at `dist/` and fail before the
// package has ever been built. A relative import keeps `bun run dev` working in
// a fresh clone, and has the playground dogfood the plugin's source.
import { acceptHotUpdates, catchCalledSignals } from '../../packages/mini/src/vite/index.ts'

export default defineConfig({
  plugins: [
    // Flags `attr={signal()}` — the one footgun of a compilerless JSX. Warns in
    // the dev overlay, fails `vite build`.
    catchCalledSignals(),
    // Marks whichever module calls `hotMount` as the hot-update boundary, so an
    // edit swaps the tree instead of reloading the page. Both halves are
    // required: see `src/main.tsx`.
    acceptHotUpdates(),
  ],
  resolve: {
    // Pin the `development` condition in both `serve` and `build`. Vite's
    // default is `development|production`, which would resolve `@amritk/mini`
    // to `dist/` for a production build and make the playground depend on
    // build ordering; resolving to source instead means this app always
    // exercises the code in this checkout, which is the point of a playground.
    conditions: ['development', 'module', 'browser'],
  },
  build: {
    target: 'es2022',
    // The whole app is one page of demos — a single chunk keeps the Cloudflare
    // asset listing readable and the waterfall flat.
    chunkSizeWarningLimit: 800,
  },
})
