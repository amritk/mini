import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = process.cwd().includes('/packages/') ? resolve(process.cwd(), '../..') : process.cwd()

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${resolve(process.cwd(), 'src')}/` },
      // mini's JSX transform emits `import { jsx } from '@amritk/mini/jsx-runtime'`,
      // so the runtime subpaths must resolve to source (more specific first).
      { find: /^@amritk\/mini\/jsx-runtime$/, replacement: resolve(root, 'packages/mini/src/jsx-runtime.ts') },
      { find: /^@amritk\/mini\/jsx-dev-runtime$/, replacement: resolve(root, 'packages/mini/src/jsx-dev-runtime.ts') },
      // mini-native's transform emits the same imports against its own runtime;
      // both packages' entries must be matched before the shorter `@amritk/mini`
      // pattern would swallow them.
      {
        find: /^@amritk\/mini-native\/jsx-runtime$/,
        replacement: resolve(root, 'packages/mini-native/src/jsx-runtime.ts'),
      },
      {
        find: /^@amritk\/mini-native\/jsx-dev-runtime$/,
        replacement: resolve(root, 'packages/mini-native/src/jsx-dev-runtime.ts'),
      },
      { find: /^@amritk\/mini-native$/, replacement: resolve(root, 'packages/mini-native/src/index.ts') },
      { find: /^@amritk\/mini$/, replacement: resolve(root, 'packages/mini/src/index.ts') },
      // `@amritk/runtime-validators` is deliberately absent: it is an optional
      // peer published from the mjst repo, so it resolves from node_modules as
      // a consumer's would rather than from a sibling workspace's source.
    ],
  },
  test: {
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
  },
})
