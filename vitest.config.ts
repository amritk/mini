import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = import.meta.dirname

export default defineConfig({
  resolve: {
    alias: [
      // niv's JSX transform emits `import { jsx } from '@amritk/niv/jsx-runtime'`,
      // so the package's own specifiers must resolve to source — the suite runs
      // against this checkout with no prior `bun run build`. The subpath pattern
      // comes first so the bare one cannot swallow it.
      { find: /^@amritk\/mini\/(.+)$/, replacement: `${resolve(root, 'src')}/$1` },
      { find: /^@amritk\/mini$/, replacement: resolve(root, 'src/index.ts') },
      // `@amritk/runtime-validators` is deliberately absent: it is an optional
      // peer published from the mjst repo, so it resolves from node_modules as
      // a consumer's would.
    ],
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'examples/**/*.test.{ts,tsx}'],
  },
})
