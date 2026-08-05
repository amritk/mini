import { defineConfig } from 'vite'

// The plugins are imported from the workspace SOURCE rather than through
// `@amritk/mini/vite`, because a config file has to load before anything else
// can: the package name would point at a `dist/` that a fresh clone has not
// built yet, and the failure would be vite refusing to start rather than
// anything about the app. A relative import also has the playground dogfood the
// plugin's source.
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
  build: {
    target: 'es2022',
    // The whole app is one page of demos — a single chunk keeps the Cloudflare
    // asset listing readable and the waterfall flat.
    chunkSizeWarningLimit: 800,
  },
})
