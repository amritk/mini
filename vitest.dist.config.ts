import { defineConfig } from 'vitest/config'

/**
 * Config for the built-artifact tests under scripts/ (the dist smoke test) —
 * deliberately without the src/ aliases from vitest.config.ts, because the
 * point is to exercise the compiled dist/ artifacts exactly as they ship to
 * npm. Requires a prior `bun run build`; run via `bun run test:dist`.
 */
export default defineConfig({
  test: {
    include: ['scripts/*.test.ts'],
    testTimeout: 120_000,
  },
})
