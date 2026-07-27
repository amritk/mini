/// <reference types="node" />
// Needs Node's zlib/url to bundle and gzip the core; pulled in explicitly
// because the package's tsconfig is browser-only (`types: []`) to keep the
// shipped sources off the Node ambient types.

import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

/**
 * The real safety net behind "zero bytes added to the widget bundle."
 *
 * The bundle-size-sensitive widget imports mini's `.` entry, so the size of
 * that entry — bundled and gzipped exactly as a consumer ships it — is the
 * number that must not move when subpath features are added. This bundles the
 * core through esbuild with a metafile and asserts two things: the gzipped size
 * stays under budget, and the built module graph contains only core sources and
 * `alien-signals`. Import a subpath into core and this test fails on both
 * counts, before the widget ever grows.
 *
 * The budget is deliberately snug against the measured size (~3.1 KB gzipped):
 * a leaked subpath adds far more than the headroom, so a real regression cannot
 * hide under it. Bump it only for an intentional, reviewed change to the core.
 * It has moved twice, both times to buy correctness or a real win:
 *
 * - ~2.7 → ~3.0 KB, when `list` took a move-minimal two-ended keyed diff (O(1)
 *   row swaps and middle removals), fragment-batched bulk inserts, and a
 *   one-call full-clear path.
 * - ~3.0 → ~3.1 KB, for a round of correctness fixes: `runDetached`, so a keyed
 *   list stops disposing every rendered row whenever the collection changes;
 *   the arbitration that keeps a style write from un-hiding what `show` hid;
 *   and pixel units for bare numeric style values, which were silently dropped.
 *
 * ## The second budget: what a JSX app actually ships
 *
 * `.` is not the whole bill. A widget written in JSX also imports
 * `@amritk/mini/jsx-runtime` — the transform emits that import itself — and
 * those bytes went unmeasured for a long time while being roughly 40% of the
 * total. So the second entry below bundles BOTH, which is the graph a consumer
 * really ships, deduplicated (both entries pull `alien-signals`, and
 * `jsx-runtime` pulls `bind`, so the sum of the two entries measured separately
 * would double-count them). The `.` budget still stands on its own for the
 * non-JSX consumer that calls `template` + `bind*`.
 */

const PKG_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Gzipped-byte ceiling for the bundled `.` entry. */
const GZIP_BUDGET = 3200

/** Gzipped-byte ceiling for `.` + `/jsx-runtime` bundled together. */
const WIDGET_GZIP_BUDGET = 4200

/** Feature directories whose sources must never enter the core graph. */
const SUBPATH_DIRS = ['flow/', 'router/', 'forms/', 'query/', 'hot/', 'internal/']

const built = await build({
  entryPoints: ['src/index.ts'],
  absWorkingDir: PKG_ROOT,
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  metafile: true,
  platform: 'browser',
  target: 'es2022',
})

// One output, not two: `stdin` re-exports both entries so esbuild resolves the
// shared modules once, exactly as a consumer's bundler does.
const widget = await build({
  stdin: {
    contents: "export * from './src/index.ts'\nexport * from './src/jsx-runtime.ts'\n",
    resolveDir: PKG_ROOT,
    loader: 'ts',
  },
  absWorkingDir: PKG_ROOT,
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  metafile: true,
  platform: 'browser',
  target: 'es2022',
})

const inputs = Object.keys(built.metafile.inputs)

describe('core-size-budget', () => {
  it('produces exactly one non-empty output file', () => {
    // Guards the measurement itself: an empty output would gzip to a handful of
    // bytes and pass the budget green, silently disarming the whole safety net.
    expect(built.outputFiles).toHaveLength(1)
    expect(built.outputFiles[0]?.contents.length ?? 0).toBeGreaterThan(0)
  })

  it('stays under the gzipped byte budget', () => {
    const output = built.outputFiles[0]?.contents ?? new Uint8Array()
    const gzipped = gzipSync(output).length
    expect(gzipped).toBeLessThanOrEqual(GZIP_BUDGET)
  })

  it('keeps the core plus the JSX runtime — what a JSX app ships — under budget', () => {
    expect(widget.outputFiles).toHaveLength(1)
    const output = widget.outputFiles[0]?.contents ?? new Uint8Array()
    expect(output.length).toBeGreaterThan(0)
    expect(gzipSync(output).length).toBeLessThanOrEqual(WIDGET_GZIP_BUDGET)
  })

  it('keeps the JSX runtime out of the subpath features too', () => {
    // The same boundary the `.` entry holds, applied to the graph the transform
    // drags in: `jsx-runtime` reaching `/flow` would put a control-flow module
    // in every JSX app whether it imported one or not.
    const offenders = Object.keys(widget.metafile.inputs).filter((input) => {
      if (input.includes('alien-signals') || input === '<stdin>') return false
      if (input.startsWith('src/') && !SUBPATH_DIRS.some((dir) => input.startsWith(`src/${dir}`))) return false
      return true
    })
    expect(offenders).toEqual([])
  })

  it('bundles only core sources and alien-signals', () => {
    const offenders = inputs.filter((input) => {
      if (input.includes('alien-signals')) return false
      if (input.startsWith('src/') && !SUBPATH_DIRS.some((dir) => input.startsWith(`src/${dir}`))) return false
      return true
    })
    expect(offenders).toEqual([])
  })

  it('pulls in no other node_modules package', () => {
    // A real assertion in both directions: every node_modules input must be
    // alien-signals, so a non-alien dependency shows up as a non-empty offenders
    // list rather than an empty loop that can only fail, never meaningfully pass.
    const foreign = inputs.filter((input) => input.includes('node_modules') && !input.includes('alien-signals'))
    expect(foreign).toEqual([])
  })
})
