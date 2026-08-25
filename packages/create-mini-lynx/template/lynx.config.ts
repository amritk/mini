import { pluginMiniLynx } from '@amritk/mini-lynx-rsbuild-plugin'
import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'
import { defineConfig } from '@lynx-js/rspeedy'

/**
 * The device build: `bun run dev:device` and `bun run build:device`.
 *
 * A Lynx template is not a bundle with an entry point — it is a container with
 * two code slots, a main-thread chunk the engine executes to build the first
 * screen and a background chunk it loads as `/app-service.js`. `pluginMiniLynx`
 * is what decides which of your files goes in which slot; everything else here
 * is rspeedy's.
 *
 * The browser preview (`bun run dev`) is a different entry and a different
 * config — `vite.config.ts`. Both build the same `src/app.tsx`.
 */
export default defineConfig({
  source: { entry: { main: './src/main-thread.ts' } },
  plugins: [
    // What `rspeedy dev` prints for a phone to scan. `fullscreen` adds a second
    // QR carrying Lynx Explorer's own `?fullscreen=true` flag, which hides its
    // chrome so the screen is the app rather than the shell around it; press
    // `a` in the terminal to switch between the two.
    pluginQRCode({ fullscreen: true }),
    pluginMiniLynx({ background: './src/background.ts' }),
  ],
})
