import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    // Pin the `development` condition in both `serve` and `build`, so
    // `@amritk/mini-lynx` and its subpaths resolve to source rather than to
    // `dist/`. The playground then always exercises the code in this checkout
    // and never depends on the packages having been built first.
    conditions: ['development', 'module', 'browser'],
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
  },
  build: {
    target: 'es2022',
  },
})
