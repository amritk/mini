import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    // Pin the `development` condition in both `serve` and `build`, so
    // `@amritk/mini-native` and its subpaths resolve to source rather than to
    // `dist/`. The playground then always exercises the code in this checkout
    // and never depends on the packages having been built first.
    conditions: ['development', 'module', 'browser'],
    // The bundler seam `@amritk/mini-native/platform` documents: when a
    // difference between targets is STRUCTURAL rather than a leaf value, split
    // the file instead of branching on `platform.os`. Nothing here needs it
    // yet — it is wired up so that the day something does, the answer is a new
    // file rather than an inline branch nobody can count.
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.jsx', '.js', '.json'],
  },
  build: {
    target: 'es2022',
  },
})
