import { createBenchmarkApp } from '../packages/mini-native/examples/js-framework-benchmark/main'
import { clearHost, setHost } from '../packages/mini-native/src/current-host'
import type { Host } from '../packages/mini-native/src/host'
import { createMemoryHost } from '../packages/mini-native/src/hosts/create-memory-host'
import { mount } from '../packages/mini-native/src/mount'

/**
 * bench-reconciler — a wall-clock number for the operations
 * `@amritk/mini-native`'s keyed list actually performs.
 *
 * The reconciler already carries a move-minimal guarantee, and that guarantee is
 * asserted in HOST CALLS: swapping two rows costs two inserts, removing from the
 * middle costs none. That proves the algorithm and says nothing about the clock —
 * an O(1) operation is still slow if the constant is. This runs the
 * js-framework-benchmark workload against the memory host and times it.
 *
 * **Why the memory host, when nobody ships one.** Its operations are array
 * splices and property writes on plain objects, so what is left in the number is
 * very nearly the runtime's own overhead: building rows, tracking effects,
 * diffing key order. That is exactly the thing this package can be held
 * responsible for. A number from the DOM or from a device would be dominated by
 * that platform's layout and commit costs, which move with the browser version
 * and the phone, and would tell you far more about them than about this code. To
 * measure a real target, put `examples/js-framework-benchmark` into the actual
 * benchmark harness — that is what the harness is for and this is not trying to
 * replace it.
 *
 * The host-call column is printed alongside, because a millisecond figure is
 * only interpretable next to the amount of work it covers — and because it is
 * where a reconciler regression shows up first and most legibly.
 *
 * Usage:
 *   bun run scripts/bench-reconciler.ts [--repeats 10] [--json]
 */

const args = process.argv.slice(2)
const argValue = (flag: string): string | undefined => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

/** How many timed runs per case. The median of these is reported. */
const REPEATS = Number(argValue('--repeats') ?? 10)
const asJson = args.includes('--json')

/** The host operations worth counting — the ones a reconciler is judged on. */
const COUNTED = ['createElement', 'createText', 'insert', 'remove', 'clear', 'setText', 'setProperty'] as const

type Counts = Record<(typeof COUNTED)[number], number>

const zeroCounts = (): Counts => ({
  createElement: 0,
  createText: 0,
  insert: 0,
  remove: 0,
  clear: 0,
  setText: 0,
  setProperty: 0,
})

/**
 * Wraps a host so every counted call increments a tally.
 *
 * Deliberately a wrapper rather than an option on the host: the memory host is
 * the reference implementation of the contract, and a counting mode inside it
 * would be a feature every future host reader had to skip past.
 */
const counting = (host: Host, counts: Counts): Host => {
  const wrapped = { ...host } as Record<string, unknown>
  for (const name of COUNTED) {
    const original = host[name] as (...call: unknown[]) => unknown
    wrapped[name] = (...call: unknown[]) => {
      counts[name] += 1
      return original(...call)
    }
  }
  return wrapped as Host
}

type Case = {
  name: string
  /** Puts the tree into the state the timed operation starts from. Not measured. */
  setup: (store: Store) => void
  run: (store: Store) => void
  /** Fewer repeats for the ten-thousand-row cases, which are slow and low-variance. */
  repeats?: number
}

type Store = ReturnType<typeof createBenchmarkApp>['store']

/**
 * The js-framework-benchmark operation set, less the ones that measure a
 * platform rather than a runtime.
 *
 * `select row` is here because it is the case a naive signals implementation
 * gets quadratically wrong — one shared `selectedId` every row reads makes
 * selecting cost a thousand effect runs — and a benchmark that omitted it would
 * be flattering.
 */
const CASES: readonly Case[] = [
  { name: 'create 1,000 rows', setup: (store) => store.clear(), run: (store) => store.run() },
  { name: 'replace all 1,000 rows', setup: (store) => store.run(), run: (store) => store.run() },
  { name: 'partial update (every 10th)', setup: (store) => store.run(), run: (store) => store.update() },
  { name: 'select row', setup: (store) => store.run(), run: (store) => store.select(store.rows()[500]?.id ?? 0) },
  { name: 'swap rows', setup: (store) => store.run(), run: (store) => store.swapRows() },
  { name: 'remove row', setup: (store) => store.run(), run: (store) => store.remove(store.rows()[500]?.id ?? 0) },
  { name: 'clear 1,000 rows', setup: (store) => store.run(), run: (store) => store.clear() },
  { name: 'create 10,000 rows', setup: (store) => store.clear(), run: (store) => store.runLots(), repeats: 3 },
  { name: 'append 1,000 to 10,000', setup: (store) => store.runLots(), run: (store) => store.add(), repeats: 3 },
]

type Result = { name: string; median: number; counts: Counts }

/** The middle value, which resists the one slow run a garbage collection causes. */
const median = (samples: readonly number[]): number => {
  const sorted = [...samples].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
    : (sorted[middle] as number)
}

/**
 * Times one case.
 *
 * A fresh host and a fresh mount per sample, so no run inherits the previous
 * one's tree — reusing a tree would let a later `create` benefit from scopes the
 * earlier one had already built, which is how a benchmark quietly measures its
 * own warm-up.
 *
 * The first sample is discarded as warm-up: the JIT has not seen the reconciler
 * yet on the first pass, and reporting that as the cost of creating a thousand
 * rows would be blaming this code for the engine's tiering.
 */
const measure = (benchmark: Case): Result => {
  const samples: number[] = []
  const counts = zeroCounts()

  const repeats = (benchmark.repeats ?? REPEATS) + 1
  for (let attempt = 0; attempt < repeats; attempt++) {
    const memory = createMemoryHost()
    const attemptCounts = zeroCounts()
    setHost(counting(memory.host, attemptCounts))

    const app = createBenchmarkApp()
    const dispose = mount(memory.rootElement, () => app.element)
    benchmark.setup(app.store)

    // Counted from here, so setup's own tree building does not land in the
    // column next to the timed operation.
    for (const name of COUNTED) attemptCounts[name] = 0
    const started = performance.now()
    benchmark.run(app.store)
    const elapsed = performance.now() - started

    if (attempt > 0) {
      samples.push(elapsed)
      for (const name of COUNTED) counts[name] = attemptCounts[name]
    }

    dispose()
    clearHost()
  }

  return { name: benchmark.name, median: median(samples), counts }
}

const results = CASES.map(measure)

if (asJson) {
  console.log(JSON.stringify({ repeats: REPEATS, results }, null, 2))
} else {
  const hostCalls = (counts: Counts): number => COUNTED.reduce((total, name) => total + counts[name], 0)
  const rows = results.map((result) => ({
    Operation: result.name,
    'Median (ms)': result.median.toFixed(2),
    'Host calls': String(hostCalls(result.counts)),
    Created: String(result.counts.createElement + result.counts.createText),
    Inserts: String(result.counts.insert),
    Removals: String(result.counts.remove + result.counts.clear),
  }))

  const columns = Object.keys(rows[0] as object)
  const width = (column: string): number => Math.max(column.length, ...rows.map((row) => (row as never)[column].length))
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((cell, index) => cell.padEnd(width(columns[index] as string))).join(' | ')} |`

  console.log(`mini-native reconciler, memory host, median of ${REPEATS}\n`)
  console.log(line(columns))
  console.log(`|${columns.map((column) => '-'.repeat(width(column) + 2)).join('|')}|`)
  for (const row of rows) console.log(line(columns.map((column) => (row as never)[column])))
}
