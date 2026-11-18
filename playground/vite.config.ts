import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// The plugins are imported from SOURCE rather than through `@amritk/niv/vite`,
// because a config file has to load before anything else can: the package name
// would point at a `dist/` that a fresh clone has not built yet, and the failure
// would be vite refusing to start rather than anything about the app.
import { acceptHotUpdates, catchCalledSignals } from '../src/vite/index.ts'

const src = fileURLToPath(new URL('../src', import.meta.url))

export default defineConfig({
  resolve: {
    // The playground lives inside the package it demos, so `@amritk/niv` and
    // every subpath resolve straight to `src` — no build step before `dev`.
    // Packaging is not what this app checks: `scripts/consumer-e2e.test.ts`
    // packs and installs a real tarball for that. The subpath pattern comes
    // first so the bare one cannot swallow it.
    alias: [
      { find: /^@amritk\/mini\/(.+)$/, replacement: `${src}/$1` },
      { find: /^@amritk\/mini$/, replacement: `${src}/index.ts` },
    ],
  },
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
