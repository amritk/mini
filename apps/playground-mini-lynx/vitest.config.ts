import { defineConfig } from 'vitest/config'

/**
 * The app's own suite, which exists for one file: the DOM Element PAPI in
 * `src/lib`.
 *
 * It is separate from the root config on purpose. That one is scoped to
 * `packages/**` and wires the `@amritk/mini-*` source aliases a package suite
 * needs; nothing here imports the runtime at all — `dom-papi.ts` takes only a
 * TYPE from it — so the aliases would be machinery for nothing.
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
