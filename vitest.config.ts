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
      // mini-lynx's transform emits the same imports against its own runtime;
      // both packages' entries must be matched before the shorter `@amritk/mini`
      // pattern would swallow them.
      {
        find: /^@amritk\/mini-lynx\/jsx-runtime$/,
        replacement: resolve(root, 'packages/mini-lynx/src/jsx-runtime.ts'),
      },
      {
        find: /^@amritk\/mini-lynx\/jsx-dev-runtime$/,
        replacement: resolve(root, 'packages/mini-lynx/src/jsx-dev-runtime.ts'),
      },
      { find: /^@amritk\/mini-lynx$/, replacement: resolve(root, 'packages/mini-lynx/src/index.ts') },
      // The native-module packages. Their subpaths must be matched before the
      // bare package pattern for the same reason the jsx-runtime entries above
      // are: a shorter anchored pattern cannot swallow them, but keeping the
      // order consistent is what stops the next one from being wrong.
      {
        find: /^@amritk\/mini-lynx-native\/background$/,
        replacement: resolve(root, 'packages/mini-lynx-native/src/background/index.ts'),
      },
      {
        find: /^@amritk\/mini-lynx-native\/testing$/,
        replacement: resolve(root, 'packages/mini-lynx-native/src/testing/index.ts'),
      },
      {
        find: /^@amritk\/mini-lynx-native$/,
        replacement: resolve(root, 'packages/mini-lynx-native/src/index.ts'),
      },
      {
        find: /^@amritk\/lynx-notifications\/testing$/,
        replacement: resolve(root, 'packages/lynx-notifications/src/testing/index.ts'),
      },
      {
        find: /^@amritk\/lynx-notifications$/,
        replacement: resolve(root, 'packages/lynx-notifications/src/index.ts'),
      },
      {
        find: /^@amritk\/lynx-location\/testing$/,
        replacement: resolve(root, 'packages/lynx-location/src/testing/index.ts'),
      },
      {
        find: /^@amritk\/lynx-location$/,
        replacement: resolve(root, 'packages/lynx-location/src/index.ts'),
      },
      {
        find: /^@amritk\/lynx-dialogs\/testing$/,
        replacement: resolve(root, 'packages/lynx-dialogs/src/testing/index.ts'),
      },
      {
        find: /^@amritk\/lynx-dialogs$/,
        replacement: resolve(root, 'packages/lynx-dialogs/src/index.ts'),
      },
      {
        find: /^@amritk\/lynx-deep-linking\/testing$/,
        replacement: resolve(root, 'packages/lynx-deep-linking/src/testing/index.ts'),
      },
      {
        find: /^@amritk\/lynx-deep-linking$/,
        replacement: resolve(root, 'packages/lynx-deep-linking/src/index.ts'),
      },
      {
        find: /^@amritk\/lynx-secure-storage\/testing$/,
        replacement: resolve(root, 'packages/lynx-secure-storage/src/testing/index.ts'),
      },
      {
        find: /^@amritk\/lynx-secure-storage$/,
        replacement: resolve(root, 'packages/lynx-secure-storage/src/index.ts'),
      },
      // The helpers both packages share. Aliased for the same reason as the two
      // above — the suite must run against this checkout's source with no prior
      // `bun run build` — and the subpath must come first so the shorter
      // pattern cannot swallow it.
      {
        find: /^@amritk\/mini-helpers\/schema$/,
        replacement: resolve(root, 'packages/mini-helpers/src/schema/index.ts'),
      },
      { find: /^@amritk\/mini-helpers$/, replacement: resolve(root, 'packages/mini-helpers/src/index.ts') },
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
