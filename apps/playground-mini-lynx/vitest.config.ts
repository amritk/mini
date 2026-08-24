import { defineConfig } from 'vitest/config'

/**
 * The app's own suite: every screen mounted through the preview engine, and the
 * tag-coverage scan that keeps the vocabulary demoed.
 *
 * It is separate from the root config on purpose. That one is scoped to
 * `packages/**` and wires the `@amritk/mini-*` source aliases a package suite
 * needs; the screens here resolve the runtime and
 * `@amritk/mini-lynx-preview` from `node_modules`, the way a consumer's app
 * does, which is what makes a green run here a statement about the built
 * packages rather than about this checkout's `src/`.
 *
 * There is no global environment, matching the rest of the repo: a DOM test
 * opts in with a `// @vitest-environment happy-dom` pragma on line 1, so a file
 * that gets a `document` says so.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
