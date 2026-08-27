import { defineConfig } from 'vite'

/**
 * Nothing here is Lynx-specific, and that is the interesting part: the app is
 * plain TypeScript and JSX, so a browser build needs no plugin and no compiler
 * step. The JSX transform is configured once, in `tsconfig.json`, through
 * `jsxImportSource` — esbuild reads it from there.
 */
export default defineConfig({
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
  },
  build: {
    target: 'es2022',
  },
})
