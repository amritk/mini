import { pluginMiniLynx } from '@amritk/mini-lynx-rsbuild-plugin'
import { pluginQRCode } from '@lynx-js/qrcode-rsbuild-plugin'
import { defineConfig } from '@lynx-js/rspeedy'

export default defineConfig({
  source: { entry: { main: './src/main-thread.tsx' } },
  plugins: [
    // What `rspeedy dev` prints for a phone to scan. `fullscreen` adds a second
    // QR carrying Explorer's own `?fullscreen=true` flag, which hides its
    // chrome so the screen is the app rather than the shell around it; press
    // `a` in the terminal to switch between the two.
    pluginQRCode({ fullscreen: true }),
    pluginMiniLynx({ background: './src/background.ts' }),
  ],
})
