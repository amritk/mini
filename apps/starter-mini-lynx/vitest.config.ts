import { defineConfig } from 'vitest/config'

/**
 * The app's own suite: one file, driving the entry point the way the engine
 * does.
 *
 * Separate from the root config, like the other playground's, because that one
 * is scoped to `packages/**`. The `@amritk/*` specifiers here resolve through
 * the workspace to each package's `dist`, which is what a consumer's install
 * resolves to — the point of an app in this repo is to be the one place that
 * happens.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
