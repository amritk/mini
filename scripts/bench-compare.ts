import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

/**
 * bench-compare — measures the bundled, gzipped size of every `@amritk/mini`
 * and `@amritk/mini-native` entry in two trees (a baseline checkout and the
 * working tree) and prints the delta as a markdown table.
 *
 * Size is the benchmark that matters here. The charter for both packages is
 * that the `.` entry costs the bundle-size-sensitive widget zero extra bytes
 * when subpath features are added, so surfacing the `core (.)` delta right in
 * the PR description makes a regression impossible to miss. Unlike a timed
 * benchmark there is no noise to average away: esbuild's output for a given
 * source tree is deterministic, so each entry is measured once and its Δ is
 * exact.
 *
 * Usage:
 *   bun run scripts/bench-compare.ts --baseline ../mini-main [--head .]
 *     [--baseline-label main] [--output bench-delta.md]
 */

type Stats = { median: number }

/** A measurement, `null` for an entry the tree genuinely does not have, `'failed'` for a broken build. */
type Measurement = Stats | null | 'failed'

type Row = { package: string; entry: string; base: Measurement; head: Measurement }

/** Set when any measurement failed; the process exits nonzero so CI goes red. */
let sawFailure = false

const args = process.argv.slice(2)
const argValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

const baselineDir = argValue('--baseline')
if (!baselineDir) {
  console.error('usage: bench-compare.ts --baseline <dir> [--head <dir>] [--baseline-label <ref>] [--output <file>]')
  process.exit(2)
}

const base = resolve(baselineDir)
const head = resolve(argValue('--head') ?? join(import.meta.dirname, '..'))
const outputPath = argValue('--output')
const baselineLabel = argValue('--baseline-label') ?? 'main'

/**
 * The entries whose bundled, gzipped size is tracked. Optional peer deps are
 * marked external — an app that opts into `/forms` or `/query` already ships
 * them — so each number reflects the package's own code.
 */
const BUNDLE_CASES: readonly { package: string; name: string; entry: string; external: readonly string[] }[] = [
  { package: 'mini', name: 'core (.)', entry: 'packages/mini/src/index.ts', external: [] },
  { package: 'mini', name: 'flow', entry: 'packages/mini/src/flow/index.ts', external: [] },
  { package: 'mini', name: 'router', entry: 'packages/mini/src/router/index.ts', external: [] },
  {
    package: 'mini',
    name: 'forms',
    entry: 'packages/mini/src/forms/index.ts',
    external: ['@amritk/runtime-validators'],
  },
  { package: 'mini', name: 'query', entry: 'packages/mini/src/query/index.ts', external: ['@tanstack/query-core'] },
  { package: 'mini-native', name: 'core (.)', entry: 'packages/mini-native/src/index.ts', external: [] },
  { package: 'mini-native', name: 'flow', entry: 'packages/mini-native/src/flow/index.ts', external: [] },
  {
    package: 'mini-native',
    name: 'hosts/dom',
    entry: 'packages/mini-native/src/hosts/create-dom-host.ts',
    external: [],
  },
  {
    package: 'mini-native',
    name: 'hosts/lynx',
    entry: 'packages/mini-native/src/hosts/create-lynx-host.ts',
    external: [],
  },
  {
    package: 'mini-native',
    name: 'hosts/memory',
    entry: 'packages/mini-native/src/hosts/create-memory-host.ts',
    external: [],
  },
]

const gitSha = (tree: string): string => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: tree, encoding: 'utf-8' }).trim()
  } catch {
    return 'unknown'
  }
}

/**
 * Gzipped size of a bundled entry in one tree, or `null` when the entry does
 * not exist there — a subpath the baseline predates renders "n/a (new entry)"
 * rather than failing the run.
 */
const measureBundle = async (tree: string, entry: string, external: readonly string[]): Promise<Measurement> => {
  const absEntry = join(tree, entry)
  if (!existsSync(absEntry)) return null
  try {
    const result = await build({
      entryPoints: [absEntry],
      absWorkingDir: tree,
      bundle: true,
      format: 'esm',
      minify: true,
      write: false,
      platform: 'browser',
      target: 'es2022',
      external: [...external],
    })
    return { median: gzipSync(result.outputFiles[0]?.contents ?? new Uint8Array()).length }
  } catch (error) {
    sawFailure = true
    console.error(`bundle measure failed: ${entry} · ${tree}\n${error instanceof Error ? error.message : ''}`)
    return 'failed'
  }
}

/** Formats a gzipped byte count as e.g. `2,421 B`. */
const fmtBytes = (bytes: number): string => `${Math.round(bytes).toLocaleString('en-US')} B`

const cell = (measurement: Measurement): string => {
  if (measurement === 'failed') return '⚠ measure failed'
  if (!measurement) return 'n/a (new entry)'
  return fmtBytes(measurement.median)
}

/** Within this fraction the delta is called noise (⚪); beyond it, 🟢/🔴. */
const SIGNIFICANT = 0.005

const delta = (row: Row): string => {
  if (row.base === 'failed' || row.head === 'failed') return '—'
  if (!row.base || !row.head || row.base.median <= 0) return '—'
  const pct = (row.head.median - row.base.median) / row.base.median
  const bytes = row.head.median - row.base.median
  const verdict = Math.abs(pct) < SIGNIFICANT ? '⚪' : pct < 0 ? '🟢' : '🔴'
  const sign = bytes >= 0 ? '+' : ''
  return `${sign}${bytes.toLocaleString('en-US')} B (${sign}${(pct * 100).toFixed(1)}%) ${verdict}`
}

const run = async (): Promise<void> => {
  const rows: Row[] = []

  console.error('bundle size (gzip bytes)…')
  for (const bundleCase of BUNDLE_CASES) {
    const row: Row = {
      package: bundleCase.package,
      entry: bundleCase.name,
      base: await measureBundle(base, bundleCase.entry, bundleCase.external),
      head: await measureBundle(head, bundleCase.entry, bundleCase.external),
    }
    rows.push(row)
    console.error(
      `  ${row.package} · ${row.entry}: ${baselineLabel} ${cell(row.base)} → PR ${cell(row.head)}  ${delta(row)}`,
    )
  }

  const lines: string[] = []
  lines.push('<!-- mini-bench-delta:start -->')
  lines.push(`### 📦 Bundle-size delta vs ${baselineLabel} (\`${gitSha(base)}\` → \`${gitSha(head)}\`)`)
  lines.push('')
  lines.push(`| Package | Entry | ${baselineLabel} | PR | Δ |`)
  lines.push('|---|---|---:|---:|---:|')
  for (const row of rows) {
    lines.push(`| ${row.package} | ${row.entry} | ${cell(row.base)} | ${cell(row.head)} | ${delta(row)} |`)
  }
  lines.push('')
  lines.push(
    '<sub>Gzipped bytes of each bundled entry (esbuild, minified, browser/es2022, optional peer deps external). ' +
      'Bundling is deterministic, so unlike a timed benchmark these numbers carry no noise and every Δ is exact. ' +
      "⚪ within ±0.5% · 🟢 smaller · 🔴 larger. Each package's `core (.)` must stay flat as subpath features land — " +
      'that is the whole charter, and `src/core-size-budget.test.ts` holds the absolute ceiling.</sub>',
  )
  lines.push('<!-- mini-bench-delta:end -->')

  const markdown = lines.join('\n')
  if (outputPath) writeFileSync(outputPath, `${markdown}\n`, 'utf-8')
  console.log(markdown)

  if (sawFailure) {
    console.error('one or more bundle measurements failed — the delta table above is incomplete')
    process.exitCode = 1
  }
}

await run()
